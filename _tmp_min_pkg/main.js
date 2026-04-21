const { app, BrowserWindow } = require('electron');
app.whenReady().then(() => {
  const win = new BrowserWindow({ show: false });
  win.loadURL('data:text/html,<h1>ok</h1>');
  setTimeout(() => app.quit(), 1000);
});
