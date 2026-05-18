import { useState } from "react";
import { VideoForm } from "./views/video-form.js";

export default function Command() {
  const [url, setUrl] = useState("");
  return <VideoForm url={url} onUrlChange={setUrl} />;
}
