import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

vi.mock("../src/lib/run", () => ({ runWithWatchdog: vi.fn() }));

import { runWithWatchdog } from "../src/lib/run";
import { LinkLoadError, bodyText } from "../src/lib/link-context";
import { buildPostArgs, loadPostLink, parseGalleryJson } from "../src/lib/sources/post";

const fixture = (name: string) =>
  JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/links", name), "utf8")) as unknown;
const NOW = Date.UTC(2026, 8, 30);

describe("parseGalleryJson", () => {
  // Real `gallery-dl -j` output for a NASA post (no login needed for profile listings).
  it("reads an Instagram post: caption, author, co-authors, date, likes, images", () => {
    const ctx = parseGalleryJson(fixture("instagram-posts.json"), "https://www.instagram.com/p/DdHyaYAifb6/", NOW);
    expect(ctx).toMatchObject({
      kind: "post",
      key: "instagram:DdHyaYAifb6",
      site: "Instagram",
      title: "Cementing their names in history.",
      author: "NASA (@nasa)",
      publishedAt: "2026-09-10",
    });
    expect(ctx.facts).toContainEqual({ label: "Co-authors", value: "@nasakennedy, @nasaartemis" });
    expect(ctx.stats).toEqual(
      expect.arrayContaining([
        { label: "Likes", value: "117.6K" },
        { label: "Images", value: "4" },
      ]),
    );
    expect(bodyText(ctx.body)).toContain("The Artemis III crew is leaving their mark");
    expect(ctx.images?.[0]).toMatch(/^https:\/\/scontent[^ ]+cdninstagram\.com\//);
    expect(ctx.thumbnail).toBe(ctx.images?.[0]);
  });

  // Hand-made from gallery-dl's Reddit fields: anonymous Reddit access is blocked, so no real recording.
  it("reads a Reddit post: title, text, subreddit, score, comments and hashtags", () => {
    const ctx = parseGalleryJson(
      fixture("reddit-post.crafted.json"),
      "https://www.reddit.com/r/Breadit/comments/1abcde/",
      NOW,
    );
    expect(ctx).toMatchObject({
      key: "reddit:1abcde",
      site: "Reddit",
      title: "I built a bread oven in my backyard",
      author: "u/crumb_lord",
      publishedAt: "2026-09-20",
      tags: ["#DIY", "#baking"],
    });
    expect(ctx.facts).toContainEqual({ label: "Subreddit", value: "r/Breadit" });
    expect(ctx.stats).toEqual(
      expect.arrayContaining([
        { label: "Score", value: "5.3K" },
        { label: "Comments", value: "412" },
      ]),
    );
    expect(ctx.body).toEqual({
      type: "paragraphs",
      paragraphs: [
        "Took three weekends and about 400 bricks.",
        "The dome is the hard part: I used a sand form and wet newspaper.",
        "#DIY #baking",
      ],
    });
  });

  it("says Reddit blocks anonymous access, with a way to fix it", () => {
    const read = () =>
      parseGalleryJson(fixture("reddit-blocked.json"), "https://www.reddit.com/r/pics/comments/92dd8/");
    expect(read).toThrow(LinkLoadError);
    expect(read).toThrow("Reddit blocks anonymous access. Set Gallery: Cookies from Browser in preferences.");
    try {
      read();
    } catch (error) {
      expect((error as LinkLoadError).fix).toBe("preferences");
    }
  });

  it("says a login is needed when Instagram redirects to its login page", () => {
    expect(() => parseGalleryJson(fixture("instagram-login.json"), "https://www.instagram.com/p/DdHyaYAifb6/")).toThrow(
      "Instagram wants you to log in to see this post. Set Gallery: Cookies from Browser in preferences.",
    );
  });

  it("passes other gallery-dl errors on without a fix", () => {
    const json = [[-1, { error: "NotFoundError", message: "Requested post could not be found" }]];
    expect(() => parseGalleryJson(json, "https://www.instagram.com/p/x/")).toThrow(
      "Couldn't read this post: Requested post could not be found",
    );
  });

  it("notes a post without any text", () => {
    const json = [[2, { category: "imgur", id: "a1", date: "2026-01-02 03:04:05" }]];
    const ctx = parseGalleryJson(json, "https://imgur.com/a/a1", NOW);
    expect(ctx).toMatchObject({ title: "Post on Imgur", body: { paragraphs: [] }, noteReason: "none" });
    expect(ctx.note).toBe("This post has no caption or text, so answers come from its details.");
  });
});

describe("buildPostArgs", () => {
  it("reads metadata only, and never lets the URL become an option", () => {
    expect(buildPostArgs("https://www.instagram.com/p/X/")).toEqual([
      "-j",
      "--range",
      "1-20",
      "--",
      "https://www.instagram.com/p/X/",
    ]);
    expect(buildPostArgs("https://www.reddit.com/r/x/", "firefox")).toEqual([
      "-j",
      "--range",
      "1-20",
      "--cookies-from-browser",
      "firefox",
      "--",
      "https://www.reddit.com/r/x/",
    ]);
  });
});

describe("loadPostLink", () => {
  beforeEach(() => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.mocked(runWithWatchdog).mockReset();
  });

  const printed = (json: unknown) => ({ code: 0, stdout: JSON.stringify(json), stderr: "" });
  // Where the pin.it fixture's short link leads, and what gallery-dl prints there (trimmed from a real run).
  const PIN_URL =
    "https://www.pinterest.com/pin/858146903966145191/sent/?sender=858147041405047427&invite_code=d7494ea7610c324ffc1ef6c20c4e29c4";
  const PIN = [
    [
      2,
      {
        category: "pinterest",
        subcategory: "pin",
        id: "858146903966145191",
        description: "Moraine Lake ~ Banff National Park, Lake Louise, Alberta, Canada",
      },
    ],
    [
      3,
      "https://i.pinimg.com/originals/12/e0/f8/12e0f8109d25f31e195398ade852187a.jpg",
      { category: "pinterest", id: "858146903966145191", extension: "jpg" },
    ],
  ];
  const NOTHING = "Couldn't read this post: gallery-dl found nothing at this link.";

  // Real `gallery-dl -j` output for a pin.it link: only the pin it stands for, as a queue record.
  it("reads the pin a pin.it short link stands for", async () => {
    vi.mocked(runWithWatchdog)
      .mockResolvedValueOnce(printed(fixture("pinterest-pinit.json")))
      .mockResolvedValueOnce(printed(PIN));
    const ctx = await loadPostLink("https://pin.it/Hvt8hgT", {});
    expect(ctx).toMatchObject({
      url: "https://pin.it/Hvt8hgT",
      key: "pinterest:858146903966145191",
      site: "Pinterest",
      title: "Moraine Lake ~ Banff National Park, Lake Louise, Alberta, Canada",
    });
    const calls = vi.mocked(runWithWatchdog).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[1][1].slice(-2)).toEqual(["--", PIN_URL]);
  });

  it("reads the post a Reddit share link stands for, with the same cookies", async () => {
    const post = "https://www.reddit.com/r/Breadit/comments/1abcde/i_built_a_bread_oven/";
    vi.mocked(runWithWatchdog)
      .mockResolvedValueOnce(printed([[6, post, { category: "reddit", subcategory: "redirect" }]]))
      .mockResolvedValueOnce(printed(fixture("reddit-post.crafted.json")));
    const ctx = await loadPostLink("https://www.reddit.com/r/Breadit/s/abc456GHIJ", { cookiesFromBrowser: "firefox" });
    expect(ctx).toMatchObject({ url: "https://www.reddit.com/r/Breadit/s/abc456GHIJ", key: "reddit:1abcde" });
    const args = vi.mocked(runWithWatchdog).mock.calls[1][1];
    expect(args).toContain("firefox");
    expect(args.slice(-2)).toEqual(["--", post]);
  });

  it("follows a short link only once", async () => {
    vi.mocked(runWithWatchdog)
      .mockResolvedValueOnce(printed(fixture("pinterest-pinit.json")))
      .mockResolvedValueOnce(printed([[6, "https://www.pinterest.com/pin/1/", {}]]));
    await expect(loadPostLink("https://pin.it/Hvt8hgT", {})).rejects.toThrow(NOTHING);
    expect(runWithWatchdog).toHaveBeenCalledTimes(2);
  });

  it("only follows a short link to a gallery site a pasted link could reach", async () => {
    for (const target of [
      "http://pinterest.local/pin/1/",
      "https://pinterest.attacker.example/pin/1/",
      "http://192.168.1.10/pin/1/",
      "http://localhost:8080/",
      "https://example.com/",
      "https://www.youtube.com/watch?v=abc",
      "file:///etc/passwd",
      "--config=evil.conf",
      "https://www.pinterest.com\\@192.168.1.10/",
    ]) {
      vi.mocked(runWithWatchdog).mockReset();
      vi.mocked(runWithWatchdog).mockResolvedValueOnce(printed([[6, target, {}]]));
      await expect(loadPostLink("https://pin.it/Hvt8hgT", {})).rejects.toThrow(NOTHING);
      expect(runWithWatchdog).toHaveBeenCalledTimes(1);
    }
  });

  it("leaves queue records alone when the post itself, or an error, was found", async () => {
    vi.mocked(runWithWatchdog).mockResolvedValueOnce(
      printed([
        [2, { category: "imgur", id: "a1" }],
        [6, "https://imgur.com/a/b2", {}],
      ]),
    );
    expect(await loadPostLink("https://imgur.com/a/a1", {})).toMatchObject({ key: "imgur:a1" });

    vi.mocked(runWithWatchdog).mockResolvedValueOnce(
      printed([
        [6, PIN_URL, {}],
        [-1, { error: "NotFoundError", message: "Requested pin could not be found" }],
      ]),
    );
    await expect(loadPostLink("https://pin.it/Hvt8hgT", {})).rejects.toThrow(
      "Couldn't read this post: Requested pin could not be found",
    );
    expect(runWithWatchdog).toHaveBeenCalledTimes(2);
  });

  it("runs gallery-dl and maps what it prints", async () => {
    vi.mocked(runWithWatchdog).mockResolvedValueOnce({
      code: 0,
      stdout: fs.readFileSync(path.join(__dirname, "fixtures/links/reddit-post.crafted.json"), "utf8"),
      stderr: "",
    });
    const ctx = await loadPostLink("https://www.reddit.com/r/Breadit/comments/1abcde/", {
      cookiesFromBrowser: "safari",
    });
    expect(ctx.site).toBe("Reddit");
    expect(vi.mocked(runWithWatchdog).mock.calls[0][1]).toContain("safari");
  });

  it("reports gallery-dl's own error when it prints no JSON", async () => {
    vi.mocked(runWithWatchdog).mockResolvedValueOnce({ code: 1, stdout: "", stderr: "ERROR: Unsupported URL" });
    await expect(loadPostLink("https://www.reddit.com/r/x/", {})).rejects.toThrow("ERROR: Unsupported URL");
  });
});
