const offset = document.getElementById("offset");
const volume = document.getElementById("volume");
const offsetOut = document.getElementById("offsetOut");
const volumeOut = document.getElementById("volumeOut");

function render() {
  const o = Number(offset.value);
  offsetOut.textContent = (o > 0 ? "+" : "") + o + " ms";
  volumeOut.textContent = volume.value + "%";
}
function save() {
  render();
  chrome.storage.sync.set({ offsetMs: Number(offset.value), volume: Number(volume.value) / 100 });
}

chrome.storage.sync.get({ offsetMs: 0, volume: 1 }, (s) => {
  offset.value = s.offsetMs;
  volume.value = Math.round(s.volume * 100);
  render();
});
offset.addEventListener("input", save);
volume.addEventListener("input", save);

document.getElementById("preview").addEventListener("click", () => {
  const a = new Audio("zero-return-by-death-trimmed.mp3");
  a.volume = Number(volume.value) / 100;
  const o = Number(offset.value);
  a.currentTime = o < 0 ? -o / 1000 : 0;
  setTimeout(() => a.play(), Math.max(0, o));
});
document.getElementById("reset").addEventListener("click", () => {
  offset.value = 0;
  volume.value = 100;
  save();
});
