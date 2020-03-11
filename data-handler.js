const path = require('path');
const fs = require('fs');

const dataPath = path.join(__dirname, 'data.json');

createData = () => {
  fs.writeFileSync(dataPath, '{}', { encoding: 'utf-8' });
}

readData = (callback) => {
  if (!fs.existsSync(dataPath)) createData();

  fs.readFile(dataPath, { encoding: 'utf-8' }, (err, data) => {
    if (err) throw new Error(err);

    const parsedData = JSON.parse(data);
    callback(parsedData);
  })
}

writeData = (data) => {
  if (!fs.existsSync(dataPath)) createData();

  const txtData = JSON.stringify(data);
  fs.writeFile(path.join(__dirname, 'data.json'), txtData, { encoding: 'utf-8' }, (err) => {
    if (err) throw new Error(err);
  })
}

module.exports = { readData, writeData };