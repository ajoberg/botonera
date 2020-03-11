const { ipcRenderer } = require('electron');
const $ = require('./jquery-3.4.1.min.js');
const fs = require('fs');

ipcRenderer.on('focus', () => focusSearch());
ipcRenderer.on('loadDirectory', (_, data) => {
    loadDirectory(data);
});
ipcRenderer.on('updateSettings', (_, data) => {
    updateSettings(data);
    updateFilter();
});
ipcRenderer.on('requestUpdateAudioDevices', () => {
    updateAudioDevices();
});

$('selectFolderBtn').click(() => {
    window.postMessage({ action: 'selectFolder' });
});

const availableTypes = ['.mp3', '.wav'];

let path = '';
let currentPath = '';
let directory = {};
let filter = '';
let filteredDirectory = {};
let playing = [];
let settings = {
    audioDevice: 'default',
    toggleFolderOrder: true,
    lookInside: true,
    multiTrigger: false,
    width: 800,
    height: 600,
};

updateAudioDevices = async () => {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioDevices = devices.filter(device => device.kind === 'audiooutput');
    let list = [];
    audioDevices.forEach(a => {
        list.push({ id: a.deviceId, label: a.label });
    });
    window.postMessage({ action: 'updateAudioDevices', list, current: settings.audioDevice });
}
updateAudioDevices();

loadDirectory = p => {
    if (!p || p == '') return;
    if (!fs.lstatSync(p).isDirectory()) return;
    
    path = currentPath = p;
    filter = '';
    // cleanup and load path
    $('#empty').remove();
    $('#topContainer').remove();
    $('#loading').remove();
    $('#list').remove();
    const loading = $('<div id="loading">Loading...</div>');
    $('body').append(loading);

    // wait a sec for loading to draw before going crazy with the readdirSyncs
    setTimeout(continueLoadingDirectory, 1, loading);
}
continueLoadingDirectory = (loading) => {
    const files = fs.readdirSync(path);
    // extract only relevant files (mp3 and folders)
    directory = {
        name: path.split('\\')[-1], // last folder of the path
        content: [],
        isDir: true,
    };
    files.forEach(file => {
        const isDir = fs.lstatSync(path+'\\'+file).isDirectory();
        const isAudio = isAvailableType(file);
        if (isDir || isAudio) directory.content.push({ name: file, isDir, path });
    });
    getSubdirectories(directory.content, path);
    console.log('directory fully created', directory)
    loading.remove();

    // draw top container
    const topContainer = $('<div id="topContainer"></div>');
    $('body').append(topContainer);

    // draw search
    const search = $('<input id="search" name="search" type="search" placeholder="search">');
    search.on('input', e => {
        filter = e.currentTarget.value;
        updateFilter();
    });
    topContainer.append(search);
    $('body').click(focusSearch); // always keep focus
    focusSearch();

    // draw controls
    const controls = $('<div id="controls"></div>');
    const stop = $('<button id="stop" class="disabled" title="Stop">&#9724;</button>');
    stop.click(() => {
        playing.forEach(audio => {
            audio.removeEventListener('ended', handleAudioEnded);
            audio.pause();
        });
        playing = [];
        stop.addClass('disabled');
    });
    controls.append(stop);
    topContainer.append(controls);
    
    // draw folder navigation buttons
    const folderNav = $('<div id="folderNav"></div>');
    topContainer.append(folderNav);
    const upFolder = $('<button id="upFolder" title="Move to folder above">&#8593;</button>');
    upFolder.click(() => goUpAFolder());
    folderNav.append(upFolder);
    const refresh = $('<button id="refresh" title="Refresh">&#8635;</button>');
    refresh.click(() => loadDirectory(path));
    folderNav.append(refresh);

    // draw pathview
    const pathView = $('<div id="pathView"></div>');
    topContainer.append(pathView);

    // render
    renderList();
}

isAvailableType = file => {
    let result = false;
    availableTypes.forEach(type => {
        if (file.indexOf(type) === file.length - type.length) result = true;
    });
    return result;
}

// keep focus on search
focusSearch = () => $('#search').focus();

getSubdirectories = (currentDirectory, currentPath) => {
    currentDirectory.forEach(file => {
        if (file.isDir && !file.content) {
            file.content = [];
            const path = currentPath+'\\'+file.name;
            const subdirs = fs.readdirSync(path);
            subdirs.forEach(subdir => {
                const isDir = fs.lstatSync(path+'\\'+subdir).isDirectory();
                const isAudio = isAvailableType(subdir);
                if (isDir || isAudio) file.content.push({ name: subdir, isDir, path });
                if (isDir) getSubdirectories(file.content, path); // recursion!
            })
            
        }
    });
}

updateFilter = () => {
    if (filter === '') {
        filteredDirectory = directory;
        updateSettings();
        return;
    }

    filteredDirectory = recursiveSearch(directory.content, filter, { content: [] });
    updateSettings();
}

recursiveSearch = (dir, filter, result) => {
    dir.forEach(file => {
        const filenameLower = file.name.toLowerCase();
        const filterLower = filter.toLowerCase();
        if (filenameLower.indexOf(filterLower) > -1) {
            result.content.push(file);
        }
        if (file.isDir && file.content && settings.lookInside) recursiveSearch(file.content, filter, result);
    });
    return result;
}

updateSettings = (s) => {
    settings = { ...settings, ...s };
    updatePlayingAudios();
    renderList();
}

updatePlayingAudios = () => {
    if (settings.audioDevice) {
        playing.forEach(async audio => {
            await audio.setSinkId(settings.audioDevice);
        });
    }
}

sortByName = dir => {
    const byName = (a, b) => {
        if (a.name < b.name) return -1;
        if (a.name === b.name) return 0;
        if (a.name > b.name) return 1;
    };
    dir.sort(byName);
}

sortByType = dir => {
    const byType = (a, b) => {
        if (a.isDir && !b.isDir) return -1;
        if (!a.isDir && b.isDir) return 1;
        return 0;
    };
    dir.sort(byType);
}

renderList = () => {
    // cleanup
    let list = $('#list');
    if (list.length === 0) {
        list = $('<div id="list"></div>');
        $('body').append(list);
    }
    list.empty();
    list.css('height', (settings.height - 40) + 'px'); // 40px for topContainer

    if (path === currentPath) {
        $('#upFolder').addClass('disabled');
    } else {
        $('#upFolder').removeClass('disabled');
    }

    $('#pathView').text(currentPath);

    // draw active list
    const activeList = (filter.length > 0) ? filteredDirectory : directory;
    let currentDir = getCurrentFolder(activeList.content);

    // sort
    if (settings.toggleFolderOrder) {
        sortByType(currentDir);
    } else {
        sortByName(currentDir);
    }

    currentDir.forEach(file => {
        const className = file.isDir ? 'class="folder"' : '';
        const filePath = file.path+'\\'+file.name;
        const title = 'title="'+filePath+'"';
        const displayName = file.name.indexOf('.') > -1
            ? file.name.substring(0, file.name.lastIndexOf('.'))
            : file.name;
        const item = $('<div '+className+' '+title+'>'+displayName+'</div>');
        item.click(async () => {
            if (file.isDir) {
                currentPath = filePath;
                renderList();
            } else {
                // check settings and stop audio
                if (!settings.multiTrigger) {
                    const stopped = stopAudio(filePath);
                    if (stopped) return; // and cut the flow here
                }
                const audio = new Audio(filePath);
                if (settings.audioDevice) await audio.setSinkId(settings.audioDevice);
                audio.currentTime = 0;
                audio.play();
                audio.addEventListener('ended', handleAudioEnded);
                playing.push(audio);
                $('#stop').removeClass('disabled');
            }
            focusSearch();
        });
        item.appendTo(list);
    });
}

stopAudio = filePath => {
    let stopped = false;
    playing = playing.filter(audio => {
        const audioSrc = decodeURI(audio.src.replace('file:///', '').split('/').join('\\'));
        if (audioSrc === filePath) {
            audio.removeEventListener('ended', handleAudioEnded);
            audio.pause();
            stopped = true;
            return false;
        }
        return true;
    });
    if (playing.length === 0) {
        $('#stop').addClass('disabled');
    } else {
        $('#stop').removeClass('disabled');
    }
    return stopped;
}

getCurrentFolder = list => {
    if (currentPath === path) return list;

    const subdirs = currentPath.replace(path+'\\', '').split('\\');
    let current = list;
    subdirs.forEach(dir => {
        const sub = current.filter(c => c.name === dir)[0];
        if (!sub) throw new Error('hey! no content for folder '+currentPath+', name: '+dir);
        current = sub && sub.content;
    });
    return current;
}

handleAudioEnded = (e) => {
    const audio = e.currentTarget;
    audio.removeEventListener('ended', handleAudioEnded);
    playing.splice(playing.indexOf(audio), 1);

    if (playing.length === 0) $('#stop').addClass('disabled');
}

goUpAFolder = () => {
    if (currentPath === path) return;

    const folderAbove = currentPath.split('\\').slice(0, -1).join('\\');
    currentPath = folderAbove;
    renderList();
}