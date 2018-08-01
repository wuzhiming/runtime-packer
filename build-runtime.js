var WEBPACK_DIR_NAME = "config";
var WEBPACK_NAME = "webpack.config.js";
var SRC_DIR_NAME = "engine/src";
var RES_DIR_NAME = "engine/res";
var JSB_ADAPTER_DIR_NAME = "engine/jsb-adapter";
var SIGN_DIR_NAME = "sign";
var GAME_MANIFEST_DIR_NAME = "src";
var MAIN_JS_NAME = "game.js";
var GAME_CONFIG_JSONS_NAME = "manifest.json";

// main.js
var path = require('path');
var fs = require('fs');
var JSZip = require('./lib/jszip.min.js');

var zipRootPath;

// 获取资源文件
function getResPath(name) {
    var resPath = path.join(__dirname, "res");
    return path.join(resPath, name);
}

// 遍历 dir
function walkDir(dir, fileCb, dirCb, complete) {
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

function zipDir(zipObj, dir, destDirPath, noZipFileList, complete) {
    walkDir(dir, function (parentDir, fileName) {
        var shouldZip = true;
        noZipFileList.forEach(function (noZipFile) {
            if (fileName === noZipFile) {
                shouldZip = false;
            }
        });
        //获取父目录的相对路径
        var relativeToZipParentDir = parentDir.slice(zipRootPath.length + 1, parentDir.length);
        var finalDestDir = path.join(destDirPath, relativeToZipParentDir);
        var folder = zipObj.folder(finalDestDir);
        if (shouldZip) {
            var fullPath = path.join(parentDir, fileName);
            addZipFile(folder, fileName, fullPath);
        }
    }, function (parentDir, dirName) { }, function () {
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
        var message = 'Can not find config file in ' + '\"' + Editor.projectPath + '\"';
        message = message + "\n\n" + 'We have generated a config file for you in ' + '\"' + Editor.projectPath + '/' + cfgName + '\"';
        message = message + "\n\n" + 'Please modify the file and build again';
        message = message + "\n\n" + 'Building cpk fail';
        Editor.Panel.open('cpk-publish', message);
        writeConfigFile("portrait", false, "1.0.0", projectCgfFile);
        Editor.failed('Building cpk fail');
        event.reply();
        return;
    }

    Editor.log('Building cpk ' + options.platform + ' to ' + options.dest);
    zipRootPath = options.dest;

    var resName = 'res';
    var srcName = 'src';
    var jsbAdapterName = 'jsb-adapter';

    var dirRes = path.join(options.dest, resName);
    var dirSrc = path.join(options.dest, srcName);
    var dirAdapter = path.join(options.dest, jsbAdapterName);

    var jsZip = new JSZip();

    // 处理 src 目录
    handleSrc(jsZip);
    // 处理 sign 目录
    handleSign(jsZip);
    // 处理 package.json
    handlePackage(jsZip);
    // 压缩 res src jsb-adapter 目录
    handleDirs(jsZip,
        [dirRes, dirSrc, dirAdapter],
        [RES_DIR_NAME, SRC_DIR_NAME, JSB_ADAPTER_DIR_NAME],
        [[], [], ["jsb-builtin.js"]],
        function () {
            // 生成压缩文件
            var targetName = options.title + '.cpk';
            var dirTarget = path.join(options.dest, targetName);

            // 添加 webpack.config.js 文件
            zipVIVOExternals(jsZip);

            jsZip.generateNodeStream({ type: "nodebuffer", base64: false, compression: 'DEFLATE' })
                .pipe(fs.createWriteStream(dirTarget))
                .on('finish', function () {
                    let outTips = Editor.T('EXPORT_ASSET.export_tips', { outPath: dirTarget });
                    Editor.log(outTips);
                    event.reply()
                });
        });
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
        'build-finished': onBeforeBuildFinish,
    },
};