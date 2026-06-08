const keyInput = document.getElementById("imdbKey");
const enableInput = document.getElementById("enableImdb");
const status = document.getElementById("status");

chrome.storage.sync.get(["imdbKey", "enableImdb"], (o) => {
  keyInput.value = o.imdbKey || "";
  enableInput.checked = o.enableImdb !== false;
});

document.getElementById("save").addEventListener("click", () => {
  chrome.storage.sync.set(
    {
      imdbKey: keyInput.value.trim(),
      enableImdb: enableInput.checked,
    },
    () => {
      status.textContent = "Saved";
      setTimeout(() => (status.textContent = ""), 1500);
    }
  );
});

const clearStatus = document.getElementById("clearStatus");
document.getElementById("clear").addEventListener("click", () => {
  chrome.storage.local.clear(() => {
    clearStatus.textContent = "Cache cleared — reload the cineville tab";
    clearStatus.style.color = "#00964a";
    clearStatus.style.fontWeight = "600";
    clearStatus.style.marginLeft = "12px";
    setTimeout(() => (clearStatus.textContent = ""), 2500);
  });
});
