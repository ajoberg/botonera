// Modules to control application life and create native browser window
const { app, BrowserWindow, Menu, dialog, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const { debounce } = require('lodash');
const { readData, writeData } = require('./data-handler');

let mainWindow;

// inicializamos la ventana
start = () => {
  readData(data => createWindow(data.width, data.height, data.directory));
}

createWindow = async (width = 800, height = 600, directory) => {
  if (mainWindow !== undefined) {
    mainWindow.minimize();
    mainWindow.focus();

    return;
  }

  mainWindow = new BrowserWindow({
    width,
    height,
    icon: path.join(__dirname, 'icon.png'),
    contextIsolation: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true
    }
  });

  await mainWindow.loadFile('index.html');

  // start up the render
  mainWindow.webContents.send('loadDirectory', directory);

  // open the DevTools
  // mainWindow.webContents.openDevTools();

  mainWindow.on('resize', debounce(handleResize, 1000));
  mainWindow.on('focus', () => mainWindow.webContents.send('focus'));
  mainWindow.on('closed', () => mainWindow = null);
}

handleResize = () => {
  readData(data => {
    const bounds = mainWindow.getBounds();
    if (data.width !== bounds.width || data.height !== bounds.height) {
      data.width = bounds.width;
      data.height = bounds.height;
      writeData(data);
      mainWindow.webContents.send('updateSettings', data);
    }
  });
}

app.on('ready', () => {
  globalShortcut.register('CommandOrControl+Shift+B', createWindow)
  start();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

selectFolder = async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  const directory = result.filePaths[0];
  readData(data => {
    if (data.directory !== directory) {
      data.directory = directory;
      writeData(data);
      mainWindow.webContents.send('loadDirectory', directory);
    }
  });
}

displayAbout = async () => {
  await dialog.showMessageBox(mainWindow, {
    title: 'About',
    type: 'info',
    message: 'Holis Dieguito :D',
  });
}

displaySystemInfo = async () => {
  await dialog.showMessageBox(mainWindow, {
    title: 'System Information',
    type: 'info',
    message: 'Node version: ' + process.versions.node + '\nChrome ' + process.versions.chrome + '\nElectron ' + process.versions.electron,
  });
}

toggleFolderOrder = e => {
  const toggleFolderOrder = e.checked;
  readData(data => {
    if (data.toggleFolderOrder !== toggleFolderOrder) {
      data.toggleFolderOrder = toggleFolderOrder;
      writeData(data);
      mainWindow.webContents.send('updateSettings', { toggleFolderOrder });
    }
  });
}

toggleSubdirSearch = e => {
  const lookInside = e.checked;
  readData(data => {
    if (data.lookInside !== lookInside) {
      data.lookInside = lookInside;
      writeData(data);
      mainWindow.webContents.send('updateSettings', { lookInside });
    }
  });
}

toggleMultiTrigger = e => {
  const multiTrigger = !e.checked;
  readData(data => {
    if (data.multiTrigger !== multiTrigger) {
      data.multiTrigger = multiTrigger;
      writeData(data);
      mainWindow.webContents.send('updateSettings', { multiTrigger });
    }
  });
}

// escuchamos mensajes por post para traer datos de la vista
ipcMain.on('postMessage', (e, data) => {
  if (data.action === 'selectFolder') selectFolder();
  if (data.action === 'updateAudioDevices') updateAudioDevices(data);
});

updateAudioDevices = data => {
  audioDevices.submenu = [];
  data.list.forEach(audioDevice => {
    audioDevices.submenu.push({
      label: audioDevice.label,
      type: 'checkbox',
      checked: audioDevice.id === data.current,
      click: selectAudioDevice(audioDevice.id),
    });
  })
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

selectAudioDevice = audioDevice => () => {
  readData(data => {
    if (data.audioDevice !== audioDevice) {
      data.audioDevice = audioDevice;
      writeData(data);
      mainWindow.webContents.send('updateSettings', { audioDevice });
      // update the list as well
      mainWindow.webContents.send('requestUpdateAudioDevices');
    }
  });
}

requestUpdateAudioDevices = e => {
  mainWindow.webContents.send('requestUpdateAudioDevices');
}

// menú
let audioDevices = { label: 'Change audio device' };
const template = [
  {
    label: 'File',
    submenu: [
      { label: 'Reset source folder', click: selectFolder },
      { role: 'quit' },
    ],
  }, {
    label: 'Settings',
    submenu: [
      { role: 'toggleDevTools' },
      { label: 'List folders first', type: 'checkbox', checked: true, click: toggleFolderOrder },
      { label: 'Search inside subdirectories', type: 'checkbox', checked: true, click: toggleSubdirSearch },
      { label: 'Stop current trigger by re-clicking it', type: 'checkbox', checked: true, click: toggleMultiTrigger },
      audioDevices,
    ],
  }, {
    label: 'Help',
    submenu: [
      { label: 'About', click: displayAbout },
      { label: 'System Information', click: displaySystemInfo }
    ],
  },
];

const menu = Menu.buildFromTemplate(template);
Menu.setApplicationMenu(menu);