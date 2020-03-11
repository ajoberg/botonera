const { ipcRenderer } = require('electron');

window.addEventListener('message', ({ data }) => {
  // our embedded site did a window.postMessage and therefor we will
  // proxy it back to our main process
  ipcRenderer.send('postMessage', data);
});