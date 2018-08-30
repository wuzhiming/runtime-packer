var SRC_DIR_NAME = "";
var RES_DIR_NAME = "";
var JSB_ADAPTER_DIR_NAME = "";
var GAME_MANIFEST_DIR_NAME = "";
var MAIN_JS_NAME = "main.js";
var GAME_CONFIG_JSONS_NAME = "game.config.json";

// main.js
var path = require('path');
var fs = require('fs');
var JSZip = require('./lib/jszip.min.js');
var Hashes = require('./lib/hashes.min.js');

let RUNTIME_CONFIG;
var zipRootPath;
var subpackages;

// 获取资源文件
function getResPath(name) {
    var resPath = path.join(__dirname, "res");
    return path.join(resPath, name);
}

// 遍历 dir
function walkDir(dir, fileCb, dirCb, nexDir, complete) {
    var dirList = [dir];
    var dirParentList = [path.dirname(dir)];
    do {
        var dirItem = dirList.pop();
        var dirParent = dirParentList.pop();
        nexDir(dirParent, dirItem);
        var list = fs.readdirSync(dirItem);
        list.forEach(function (file) {
            var fileFullPath = path.join(dirItem, file);
            var stat = fs.statSync(fileFullPath);
            if (stat && stat.isDirectory()) {
                dirList.push(fileFullPath);
                dirParentList.push(dirItem);
                dirCb(dirItem, file);
            } else {
                fileCb(dirItem, file);
            }
        });
        if (dirList.length <= 0) {
            complete();
        }
    } while (dirList.length > 0);
}

function zipDir(zipObj, dir, destDirPath, noZipFileList, complete) {
    zipObj = zipObj.folder(destDirPath);
    var folderParentList = [zipObj];
    var folderCurrent;

    walkDir(dir, function (parentDir, fileName) {
        var shouldZip = true;
        noZipFileList.forEach(function (noZipFile) {
            if (fileName === noZipFile) {
                shouldZip = false;
            }
        });
        if (shouldZip) {
            var fullPath = path.join(parentDir, fileName);
            addZipFile(folderCurrent, fileName, fullPath);
        }
    }, function (parentDir, dirName) {
        folderParentList.push(folderCurrent);
    }, function (parentDir, currentDir) {
        folderCurrent = folderParentList.pop().folder(currentDir.slice(parentDir.length + 1, currentDir.length));
    }, function () {
        complete();
    });
}
function addZipFile(zipObj, filePath, fullPath) {
    if (subpackages.indexOf(fullPath) !== -1) {
        return;
    }
    zipObj.file(filePath, fs.readFileSync(fullPath));
}

function initSubPackages(subpackagesObj) {
    subpackages = [];
    for (var Key in subpackagesObj) {
        var fileName = subpackagesObj[Key].path;
        var jsFile = path.join(zipRootPath, fileName);
        subpackages.push(jsFile);
    }
}

function mkSubpackageRes(targetPath, complete) {
    var subPackages = [];
    var taskCount = 0;
    subpackages.forEach(fileName => {
        var fileExt = path.extname(fileName);
        var name = path.basename(fileName, fileExt);

        var jsFile = fileName;
        var destDirPath = path.join(targetPath, name);
        if (!fs.existsSync(destDirPath)) {
            fs.mkdirSync(destDirPath);
        }
        var destFilePath = path.join(destDirPath, "main.js");

        var readStream = fs.createReadStream(jsFile);
        var writeStream = fs.createWriteStream(destFilePath);
        taskCount += 1;
        readStream.pipe(writeStream);
        writeStream.on('finish', function () {
            Editor.log(taskCount);
            taskCount -= 1;
            if (taskCount <= 0) {
                complete(subPackages);
            }
        });
        writeStream.on('error', function (err) {
            Editor.console.error(err);
            taskCount -= 1;
            if (taskCount <= 0) {
                complete(subPackages);
            }
        });

        subPackages.push(name);
    });
}

function zipSubpackage(subpackageDirs, targetPath, title, complete) {
    var count = 0;
    var subpackages = [];
    subpackageDirs.forEach(function (file) {
        var jsZip = new JSZip();
        var zipRes = path.join(targetPath, file);
        zipDir(jsZip, zipRes, "", [], function () {
            var crc32 = Hashes.CRC32(file + "/");
            var zipTarget = path.join(targetPath, title + crc32 + ".cpk");
            jsZip.generateNodeStream({ type: "nodebuffer", base64: false, compression: 'DEFLATE' })
                .pipe(fs.createWriteStream(zipTarget))
                .on('finish', function () {
                    count++;
                    // 添加配置文件数组
                    var subObj = {
                        "name": file,
                        "root": file + "/"
                    }
                    subpackages.push(subObj);
                    if (count >= subpackages.length) {
                        complete(subpackages);
                    }
                });
        });
    });
}

function writeConfigFile(subpackageArr, path) {
    var deviceOrientation = RUNTIME_CONFIG.deviceOrientation;
    var runtimeVersion = RUNTIME_CONFIG.runtimeVersion;
    var showStatusBar = RUNTIME_CONFIG.showStatusBar;
    var jsonObj = {
        "deviceOrientation": deviceOrientation,
        "showStatusBar": showStatusBar,
        "runtimeVersion": runtimeVersion,
        "subpackages": subpackageArr,
    };
    var jsonStr = JSON.stringify(jsonObj);
    fs.writeFileSync(path, jsonStr);
}

function handleSrc(zipObj) {
    var srcFolder = zipObj.folder(GAME_MANIFEST_DIR_NAME);
    //添加 main.js 文件
    var mainName = 'main.js';
    var fileMain = path.join(zipRootPath, mainName);
    addZipFile(srcFolder, MAIN_JS_NAME, fileMain);
    //添加 game.config.json 文件
    var cfgName = 'game.config.json';
    var projectCgfFile = path.join(Editor.projectPath, cfgName);
    addZipFile(srcFolder, GAME_CONFIG_JSONS_NAME, projectCgfFile);
}

function handleDirs(zipObj, dirList, destList, noZipFileList, complete) {
    var completeCount = 0;
    for (let index = 0; index < dirList.length; index++) {
        const fullDir = dirList[index];
        const destDir = destList[index];
        const noZipFiles = noZipFileList[index];
        zipDir(zipObj, fullDir, destDir, noZipFiles, function () {
            completeCount++;
            if (completeCount === dirList.length) {
                complete();
            }
        });
    }
}

function onBeforeBuildFinish(event, options) {
    Editor.log('Checking config file ' + options.dest);
    // addZipFile 方法中获取文件相对于压缩包的路径
    var cfgName = 'game.config.json';
    var projectCgfFile = path.join(Editor.projectPath, cfgName);
    if (!fs.existsSync(projectCgfFile)) {
        writeConfigFile([], projectCgfFile);
    }

    Editor.log('Building cpk ' + options.platform + ' to ' + options.dest);
    zipRootPath = options.dest;

    var resName = 'res';
    var srcName = 'src';
    var jsbAdapterName = 'jsb-adapter';

    var dirRes = path.join(options.dest, resName);
    var dirSrc = path.join(options.dest, srcName);
    var dirAdapter = path.join(options.dest, jsbAdapterName);
    var dirSubpackage = path.join(dirSrc, "assets");

    var settingPath = path.join(dirSrc, "settings.js");
    global.window = {};
    require(settingPath);
    initSubPackages(window._CCSettings.subpackages);

    var jsZip = new JSZip();

    //生成分包
    var dirTargetSubpackage = path.join(options.dest, "subpackages");
    var generateSubpackage = function () {
        // 判断项目中是否有分包
        if (!fs.existsSync(dirSubpackage)) {
            event.reply();
            return;
        }
        // 判断存放分包 cpk 目标目录是否存在
        if (!fs.existsSync(dirTargetSubpackage)) {
            fs.mkdirSync(dirTargetSubpackage);
        }
        // 生成分包目录
        mkSubpackageRes(dirTargetSubpackage, function (subpackages) {
            // 生成分包 cpk
            zipSubpackage(subpackages, dirTargetSubpackage, options.title, function (subpackageArr) {
                // 读取 config 文件
                writeConfigFile(subpackageArr, projectCgfFile);
                event.reply();
            });
        });
    }

    // 处理 src 目录
    handleSrc(jsZip);
    // 压缩 res src jsb-adapter 目录
    var dirArray = [dirRes, dirSrc, dirAdapter];

    handleDirs(jsZip,
        dirArray,
        [RES_DIR_NAME, SRC_DIR_NAME, JSB_ADAPTER_DIR_NAME, ""],
        [[], [], ["jsb-builtin.js"], []],
        function () {
            // 生成压缩文件
            var targetName = options.title + '.cpk';
            var dirTarget = path.join(options.dest, targetName);

            jsZip.generateNodeStream({ type: "nodebuffer", base64: false, compression: 'DEFLATE' })
                .pipe(fs.createWriteStream(dirTarget))
                .on('finish', function () {
                    let outTips = Editor.T('EXPORT_ASSET.export_tips', { outPath: dirTarget });
                    Editor.log(outTips);
                    generateSubpackage();
                });
        });
}

//先读取runtime相应的配置信息
function loadRuntimeSettings(event, options) {
    var value = Editor.Profile.load('profile://project/cpk-publish.json');
    RUNTIME_CONFIG = value.data;
    var deviceOrientation = RUNTIME_CONFIG.deviceOrientation;
    var runtimeVersion = RUNTIME_CONFIG.runtimeVersion;
    var showStatusBar = RUNTIME_CONFIG.showStatusBar;
    if (deviceOrientation === undefined || runtimeVersion === undefined || showStatusBar === undefined) {
        event.reply(new Error("Config error!"));
        return;
    }
    onBeforeBuildFinish(event, options);
}

module.exports = {
    name: 'OPPO 快游戏',
    platform: 'runtime',
    extends: Editor.isWin32 ? 'win32' : 'mac',
    buttons: [
        Editor.Builder.DefaultButtons.Build,
        { label: Editor.T('BUILDER.play'), message: 'play' },
    ],
    messages: {
        'build-finished': onBeforeBuildFinish,
        'play' (event, options) {
            Editor.Ipc.sendToMain('oppo-runtime-devtools:open', options);
        },
    },
    settings: Editor.url('packages://cpk-publish/build-runtime-ui.js')
};
