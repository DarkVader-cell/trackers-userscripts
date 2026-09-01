export const createTrackersSelect = (trackers: Array<string>) => {
  let select_dom = document.createElement("select");
  select_dom.id = "tracker-select";
  select_dom.style.margin = "0 5px";
  const opt = document.createElement("option");
  opt.disabled = true;
  opt.selected = true;
  opt.innerHTML = "Select target tracker";
  select_dom.appendChild(opt);
  for (let i = 0; i < trackers.length; i++) {
    const opt = document.createElement("option");
    opt.value = trackers[i];
    opt.innerHTML = trackers[i];
    select_dom.appendChild(opt);
  }
  return select_dom;
};

interface AutomationControls {
  setStatus: (message: string, running?: boolean) => void;
}

export const createAutomationControls = (
  select: HTMLSelectElement,
  onStop: () => void,
  onOpenSettings: () => void
): AutomationControls => {
  const existing = document.getElementById("find-unique-titles-automation");
  if (existing) existing.remove();

  const controls = document.createElement("span");
  controls.id = "find-unique-titles-automation";
  controls.style.cssText =
    "display:inline-flex;gap:6px;align-items:center;margin:4px 0;padding:5px 8px;border:1px solid #5d6d7e;border-radius:4px;font-size:12px;";

  const status = document.createElement("span");
  status.textContent = "Ready";
  status.style.minWidth = "110px";

  const settingsButton = document.createElement("button");
  settingsButton.type = "button";
  settingsButton.textContent = "Settings";
  settingsButton.addEventListener("click", onOpenSettings);

  const stopButton = document.createElement("button");
  stopButton.type = "button";
  stopButton.textContent = "Stop";
  stopButton.disabled = true;
  stopButton.addEventListener("click", onStop);

  controls.append(status, settingsButton, stopButton);
  select.insertAdjacentElement("afterend", controls);

  return {
    setStatus: (message, running = false) => {
      status.textContent = message;
      stopButton.disabled = !running;
    },
  };
};

const createMessageBox = () => {
  let div = document.getElementById("message-box");
  if (div) return div;
  div = document.createElement("div");
  div.id = "message-box";
  addStyle(div);
  div.addEventListener("click", () => (div!!.style.display = "none"));
  document.body.appendChild(div);
  return div;
};

export const addCounter = () => {
  let messageBox = createMessageBox();
  messageBox.innerHTML =
    'Checked: <span class="checked_count">0</span>/<span class="total_torrents_count">0</span> | New content: <span class="new_content_count">0</span>';
  messageBox.style.display = "block";
};

const addStyle = (messageBox: HTMLElement) => {
  messageBox.style.padding = "9px 26px";
  messageBox.style.position = "fixed";
  messageBox.style.top = "50px";
  messageBox.style.right = "50px";
  messageBox.style.background = "#eaeaea";
  messageBox.style.borderRadius = "9px";
  messageBox.style.fontSize = "17px";
  messageBox.style.color = "#111";
  messageBox.style.cursor = "pointer";
  messageBox.style.border = "2px solid #111";
  messageBox.style.zIndex = "4591363";
};
export const updateCount = (count: number) => {
  document.querySelector(".checked_count")!!.textContent = String(count);
};
export const updateTotalCount = (count: number) => {
  document.querySelector(".total_torrents_count")!!.textContent = String(count);
};

export const updateNewContent = (count: number) => {
  document.querySelector(".new_content_count")!!.textContent = String(count);
};
