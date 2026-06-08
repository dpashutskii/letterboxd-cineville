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
