import { Widget } from "@lumino/widgets";

export class ChannelMonitorPanel extends Widget {
  constructor(pageUrl: string) {
    super();
    this.addClass("jp-KuusiChannelMonitorPanel");

    const iframe = document.createElement("iframe");
    iframe.className = "jp-KuusiChannelMonitor-iframe";
    iframe.src = pageUrl;
    iframe.title = "Transfer speed";
    iframe.setAttribute(
      "sandbox",
      "allow-scripts allow-same-origin allow-forms allow-downloads",
    );
    this.node.appendChild(iframe);
  }
}
