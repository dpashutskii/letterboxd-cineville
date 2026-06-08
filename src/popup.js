const keyInput = document.getElementById("imdbKey");
const enableInput = document.getElementById("enableImdb");
const status = document.getElementById("status");

function flash(text) {
  status.textContent = text;
  setTimeout(() => (status.textContent = ""), 2200);
}

chrome.storage.sync.get(["imdbKey", "enableImdb"], (o) => {
  keyInput.value = o.imdbKey || "";
  enableInput.checked = o.enableImdb !== false;
});

document.getElementById("save").addEventListener("click", () => {
  chrome.storage.sync.set(
    { imdbKey: keyInput.value.trim(), enableImdb: enableInput.checked },
    () => flash("Saved ✓ — reload the cineville tab")
  );
});

document.getElementById("clear").addEventListener("click", () => {
  chrome.storage.local.clear(() => flash("Cache cleared — reload the tab"));
});
