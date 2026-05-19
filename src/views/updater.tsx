import { useEffect, useState } from "react";
import fs from "node:fs";
import {
  Action,
  ActionPanel,
  Clipboard,
  Detail,
  Icon,
  Toast,
  environment,
  getPreferenceValues,
  useNavigation,
} from "@raycast/api";
import { execa } from "execa";
import { getSpotdlPath, getWingetPath, isMac, isWindows } from "../utils.js";
import { downloadSpotdl, getInstalledVersion, getLatestRelease } from "../lib/managed-binary.js";
import { HOMEBREW_FORMULAE, WINGET_PACKAGES } from "../lib/tools.js";

const { homebrewPath } = getPreferenceValues<ExtensionPreferences>();

export default function Updater() {
  const { pop } = useNavigation();
  const emptyVersions = (): Record<string, string> =>
    Object.fromEntries([...(isMac ? HOMEBREW_FORMULAE : WINGET_PACKAGES), "spotdl"].map((name) => [name, ""]));
  const [versions, setVersions] = useState<Record<string, string>>(emptyVersions);
  const [outdated, setOutdated] = useState<Record<string, string>>(emptyVersions);
  const [upgradingMessage, setUpgradingMessage] = useState<string>("");

  const allUpToDate = Object.values(outdated).every((version) => !version);

  useEffect(() => {
    if (upgradingMessage) return;
    const toast = new Toast({ style: Toast.Style.Animated, title: "Checking versions..." });
    toast.show();

    Promise.all([getVersions(), getOutdated()])
      .then(([versions, outdated]) => {
        toast.hide();
        setVersions(versions);
        setOutdated(outdated);
      })
      .catch((error) => {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        toast.style = Toast.Style.Failure;
        toast.title = "Failed to check versions";
        toast.message = errorMessage;
        if (error instanceof Error) {
          toast.primaryAction = {
            title: "Copy to Clipboard",
            onAction: () => {
              Clipboard.copy(errorMessage);
            },
          };
        }
      });
  }, [upgradingMessage]);

  return (
    <Detail
      markdown={[
        "## Versions",
        Object.entries(versions)
          .map(([cli, version]) => {
            const status =
              version === "not installed" ? "" : outdated[cli] ? `(outdated: ${outdated[cli]})` : "(up to date)";
            return `${cli}: ${version === "" ? "Checking..." : version}${status ? ` ${status}` : ""}`;
          })
          .join("\n\n"),
        upgradingMessage,
      ]
        .filter((x) => Boolean(x))
        .join("\n\n")}
      actions={
        <ActionPanel>
          {allUpToDate ? undefined : (
            <Action
              icon={Icon.Download}
              title="Upgrade"
              onAction={async () => {
                const toast = new Toast({ style: Toast.Style.Animated, title: "Upgrading..." });
                toast.show();
                try {
                  setUpgradingMessage("Upgrading... Please do not close Raycast while the upgrade is in progress.");
                  await upgrade();
                  toast.hide();
                } catch (error) {
                  toast.style = Toast.Style.Failure;
                  toast.title = "Failed to upgrade";
                  toast.message = error instanceof Error ? error.message : "An unknown error occurred";
                  if (error instanceof Error) {
                    toast.primaryAction = {
                      title: "Copy to Clipboard",
                      onAction: () => {
                        Clipboard.copy(error.message);
                      },
                    };
                  }
                } finally {
                  setUpgradingMessage("");
                }
              }}
            />
          )}
          <Action icon={Icon.ArrowLeft} title="Back" onAction={pop} />
        </ActionPanel>
      }
    />
  );
}

async function getSpotdlVersion(): Promise<string> {
  const spotdlPath = getSpotdlPath();
  if (!fs.existsSync(spotdlPath)) return "not installed";
  try {
    return await getInstalledVersion(spotdlPath);
  } catch {
    return "unknown";
  }
}

async function getVersions() {
  const versions: Record<string, string> = {};
  if (isMac) {
    const { stdout: infoOutput } = await execa(homebrewPath, ["info", "--json=v2", ...HOMEBREW_FORMULAE]);
    const info = JSON.parse(infoOutput) as { formulae: { name: string; versions: { stable: string } }[] };
    for (const { name, versions: formulaVersions } of info.formulae) {
      versions[name] = formulaVersions.stable;
    }
  } else if (isWindows) {
    try {
      const wingetPath = await getWingetPath();
      for (const pkg of WINGET_PACKAGES) {
        try {
          const { stdout } = await execa(wingetPath, ["list", "--id", pkg, "--exact"]);
          versions[pkg] = parseWingetVersion(stdout, pkg);
        } catch {
          versions[pkg] = "";
        }
      }
    } catch {
      for (const pkg of WINGET_PACKAGES) versions[pkg] = "";
    }
  }
  versions["spotdl"] = await getSpotdlVersion();
  return versions;
}

function parseWingetVersion(output: string, packageId: string): string {
  const lines = output.split("\n");
  for (const line of lines) {
    if (line.includes(packageId)) {
      const versionMatch = line.match(/(\d+\.)+\d+/);
      if (versionMatch) {
        return versionMatch[0];
      }
    }
  }
  return "";
}

async function getOutdated() {
  const outdated: Record<string, string> = {};
  if (isMac) {
    const { stdout: outdatedOutput } = await execa(homebrewPath, ["outdated", "--json=v2", ...HOMEBREW_FORMULAE]);
    const info = JSON.parse(outdatedOutput) as { formulae: { name: string; current_version: string }[] };
    for (const { name, current_version } of info.formulae) {
      outdated[name] = current_version;
    }
  } else if (isWindows) {
    try {
      const wingetPath = await getWingetPath();
      const { stdout: upgradeOutput } = await execa(wingetPath, ["upgrade"]);
      for (const line of upgradeOutput.split("\n")) {
        for (const pkg of WINGET_PACKAGES) {
          if (line.includes(pkg)) {
            const versionMatch = line.match(/(\d+\.)+\d+/g);
            if (versionMatch && versionMatch.length >= 2) {
              outdated[pkg] = versionMatch[1];
            }
          }
        }
      }
    } catch {
      // Ignore errors
    }
  }
  try {
    const spotdlPath = getSpotdlPath();
    if (fs.existsSync(spotdlPath)) {
      const installed = await getInstalledVersion(spotdlPath);
      const latest = (await getLatestRelease()).version;
      if (installed && latest && installed !== latest) {
        outdated["spotdl"] = latest;
      }
    }
  } catch {
    // Ignore network / version-read errors — treat spotdl as up to date.
  }
  return outdated;
}

async function upgrade() {
  if (isMac) {
    await execa(homebrewPath, ["upgrade", ...HOMEBREW_FORMULAE]);
  } else if (isWindows) {
    const wingetPath = await getWingetPath();
    for (const pkg of WINGET_PACKAGES) {
      try {
        await execa(wingetPath, [
          "upgrade",
          "--id",
          pkg,
          "--accept-source-agreements",
          "--accept-package-agreements",
        ]);
      } catch {
        // A package with no available upgrade exits non-zero — skip it.
      }
    }
  }
  try {
    const spotdlPath = getSpotdlPath();
    if (fs.existsSync(spotdlPath)) {
      const installed = await getInstalledVersion(spotdlPath);
      const latest = (await getLatestRelease()).version;
      if (installed !== latest) {
        await downloadSpotdl(environment.supportPath);
      }
    }
  } catch {
    // Ignore network / version-read errors — spotdl upgrade skipped.
  }
}

export async function checkUpToDate() {
  const versions = await getOutdated();
  const allUpToDate = Object.values(versions).every((version) => !version);
  return allUpToDate;
}
