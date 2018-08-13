var WEBPACK_DIR_NAME = "config";
var WEBPACK_NAME = "webpack.config.js";
var SRC_DIR_NAME = "engine";
var RES_DIR_NAME = "engine";
var JSB_ADAPTER_DIR_NAME = "engine";
var SIGN_DIR_NAME = "sign";
var GAME_MANIFEST_DIR_NAME = "src";
var MAIN_JS_NAME = "game.js";
var GAME_CONFIG_JSONS_NAME = "manifest.json";

// main.js
var path = require('path');
var fs = require('fs');
var JSZip = require('./lib/jszip.min.js');
var Hashes = require('./lib/hashes.min.js');

let RUNTIME_CONFIG;
var zipRootPath;

function walkDir(dir, fileCb, dirCb, complete) {
// 获取资源文件
function getResPath(name) {
    var resPath = path.join(__dirname, "res");
    return path.join(resPath, name);
}

// 遍历 dir
function walkDir(dir, fileCb, dirCb, nexDir, complete) {
    var dirList = [dir];
    do {
        var dirItem = dirList.pop();
        var list = fs.readdirSync(dirItem);
        list.forEach(function (file) {
            var fileFullPath = path.join(dirItem, file);
            var stat = fs.statSync(fileFullPath);
            if (stat && stat.isDirectory()) {
                dirList.push(fileFullPath);
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

function zipDir(dir, rootPath, zip, noZipFileList, complete) {
    var dirList = [dir];
    var parentPathList = [rootPath];
    var parentZip = [zip];
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

function mkSubpackageRes(assetsPath, targetPath, complete) {
    var subPackages = [];
    var taskCount = 0;
    walkDir(assetsPath, function (parentPath, fileName) {
        var fileExt = path.extname(fileName);
        var name = path.basename(fileName, fileExt);

        var jsFile = path.join(parentPath, fileName);
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
    }, function () { }, function () { });
}

function zipSubpackage(subpackageDirs, targetPath, title, complete) {
    var count = 0;
    var subpackages = [];
    subpackageDirs.forEach(function (file) {
        var jsZip = new JSZip();
        var zipRes = path.join(targetPath, file);
        zipDir(zipRes, targetPath, jsZip, [], function () {
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

var VIVOExternals = {};
function addZipFile(zipObj, filePath, fullPath) {
    var shouldHandleRequire = false;
    var fileExt = path.extname(fullPath);
    if (fileExt === ".js") {
        var relativeToZipPath = fullPath.slice(zipRootPath.length + 1, fullPath.length);
        // 去除 main.js 以及 jsb-adapter 下除了 index.js 的文件
        if (relativeToZipPath !== "main.js" &&
            (relativeToZipPath.indexOf("jsb-adapter") !== 0 || filePath === "index.js")) {
            VIVOExternals[relativeToZipPath] = "commonjs " + relativeToZipPath;
            shouldHandleRequire = true;
        }
    }
    if (shouldHandleRequire) {
        var handleString = fs.readFileSync(fullPath, "utf8");
        /*
        若需要处理 require 的问题, 则在这里处理
        // 这里正则表达式处理 handleString, 处理完成后在添加到压缩列表中*/
        zipObj.file(filePath, handleString);
    } else {
        zipObj.file(filePath, fs.readFileSync(fullPath));
    }
}

function zipVIVOExternals(zipObj) {
    // 生成 webpack.config.js 文件，并添加到 zip 中
    var webpackName = WEBPACK_NAME;
    var webpackSource = getResPath(webpackName);
    var webpackFolder = zipObj.folder(WEBPACK_DIR_NAME);
    var webpackContent = fs.readFileSync(webpackSource, "utf8");
    webpackContent = webpackContent.replace("EXTERNALS_PLACEHOLDER", JSON.stringify(VIVOExternals));
    webpackFolder.file(webpackName, webpackContent);
}

function writeConfigFile(deviceOrientation, showStatusBar, runtimeVersion, path) {
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

function handleSign(zipObj) {
    var folder = zipObj.folder(SIGN_DIR_NAME);
    // 使用 folder 向 sign 中添加文件
    // addZipFile(folder...);
    var folderDebug = folder.folder("debug");
    var fullPath = getResPath("certificate.pem");
    addZipFile(folderDebug, "certificate.pem", fullPath);
    fullPath = getResPath("private.pem");
    addZipFile(folderDebug, "private.pem", fullPath);
}

function handlePackage(zipObj) {
    var fullPath = getResPath("package.json");
    addZipFile(zipObj, "package.json", fullPath);
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
    var dirSign = path.join(options.dest, "sign");

    //判断 res 与 src 是否遍历完成
    var isResComplete;
    var isSrcComplete;
    var isAdapterComplete;
    var jsZip = new JSZip();

    // 处理 src 目录
    handleSrc(jsZip);
    // 处理 sign 目录
    handleSign(jsZip);
    // 处理 package.json
    handlePackage(jsZip);
    // 压缩 res src jsb-adapter 目录
    var dirArray = [dirRes, dirSrc, dirAdapter];
    if (fs.existsSync(dirSign)) {
        dirArray.push(dirSign);
    }
    handleDirs(jsZip,
        dirArray,
        [RES_DIR_NAME, SRC_DIR_NAME, JSB_ADAPTER_DIR_NAME, ""],
        [[], [], ["jsb-builtin.js"], []],
        function () {
            // 生成压缩文件
            var targetName = options.title + '.cpk';
            var dirTarget = path.join(options.dest, targetName);

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
        mkSubpackageRes(dirSubpackage, dirTargetSubpackage, function (subpackages) {
            // 生成分包 cpk
            zipSubpackage(subpackages, dirTargetSubpackage, options.title, function (subpackageArr) {
                // 读取 config 文件
                writeConfigFile(subpackageArr, projectCgfFile);
                event.reply();
            });
        });
    }

    //生成压缩文件
    var jsZip = new JSZip();
    var zip = function () {
        var targetName = options.title + '.cpk';
        var dirTarget = path.join(options.dest, targetName);
            // 添加 webpack.config.js 文件
            zipVIVOExternals(jsZip);

        jsZip.generateNodeStream({ type: "nodebuffer", base64: false, compression: 'DEFLATE' })
            .pipe(fs.createWriteStream(dirTarget))
            .on('finish', function () {
                let outTips = Editor.T('EXPORT_ASSET.export_tips', { outPath: dirTarget });
                Editor.log(outTips);
                generateSubpackage();
            });
    };

    //添加 main.js 文件
    jsZip.file(mainName, fs.readFileSync(fileMain));
    //添加 game.config.json 文件
    jsZip.file(cfgName, fs.readFileSync(projectCgfFile));
    //添加 res 目录中的文件
    zipDir(dirRes, options.dest, jsZip, [], function () {
        isResComplete = true;
        if (isSrcComplete && isAdapterComplete) {
            zip();
        }
    });
    //添加 src 目录中的文件
    zipDir(dirSrc, options.dest, jsZip, ["assets"], function () {
        isSrcComplete = true;
        if (isResComplete && isAdapterComplete) {
            zip();
        }
    });
    //添加 jsb-adapter 目录中的文件
    zipDir(dirAdapter, options.dest, jsZip, ["jsb-builtin.js"], function () {
        isAdapterComplete = true;
        if (isResComplete && isSrcComplete) {
            zip();
        }
    });
            jsZip.generateNodeStream({ type: "nodebuffer", base64: false, compression: 'DEFLATE' })
                .pipe(fs.createWriteStream(dirTarget))
                .on('finish', function () {
                    let outTips = Editor.T('EXPORT_ASSET.export_tips', { outPath: dirTarget });
                    Editor.log(outTips);
                    event.reply()
                });
        });
}

//先读取runtime相应的配置信息
function loadRuntimeSettings(event,options) {
    var value = Editor.Profile.load('profile://project/cpk-publish.json');
    RUNTIME_CONFIG = value.data;
    var deviceOrientation = RUNTIME_CONFIG.deviceOrientation;
    var runtimeVersion = RUNTIME_CONFIG.runtimeVersion;
    var showStatusBar = RUNTIME_CONFIG.showStatusBar;
    if (deviceOrientation === undefined || runtimeVersion === undefined || showStatusBar === undefined) {
        event.reply(new Error("Config error!"));
        return;
    }
    onBeforeBuildFinish(event,options);
}

module.exports = {
    name: 'VIVO 快游戏',
    platform: 'runtime',
    extends: Editor.isWin32 ? 'win32' : 'mac',
    buttons: [
        Editor.Builder.DefaultButtons.Build,
        { label: Editor.T('BUILDER.play'), message: 'play' },
    ],
    messages: {
        'build-finished': loadRuntimeSettings,
        'play'(event, options) {
            Editor.Ipc.sendToMain('oppo-runtime-devtools:open', options);
        },
        'build-finished': onBeforeBuildFinish,
    },
    settings: Editor.url('packages://cpk-publish/build-runtime-ui.js')
};