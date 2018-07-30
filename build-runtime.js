// main.js
var path = require('path');
var fs = require('fs');
var JSZip = require('./lib/jszip.min.js');
var jsZip = new JSZip();

var rootPath;

function walk(dir, noZipFileList, complete) {
    var dirList = [dir];
    var parentPathList = [rootPath];
    var parentZip = [jsZip];
    do {
        var dirItem = dirList.pop();
        var dirParentPath = parentPathList.pop();
        var dirZip = parentZip.pop();
        var folder = dirZip.folder(dirItem.slice(dirParentPath.length + 1, dirItem.length));
        var list = fs.readdirSync(dirItem);
        list.forEach(function (file) {
            var shouldZip = true;
            noZipFileList.forEach(function (noZipFile) {
                if (file === noZipFile) {
                    shouldZip = false;
                }
            });
            if (shouldZip) {
                file = path.join(dirItem, file);
                var stat = fs.statSync(file);
                if (stat && stat.isDirectory()) {
                    dirList.push(file);
                    parentPathList.push(dirItem);
                    parentZip.push(folder);
                } else {
                    addZipFile(folder, file.slice(dirItem.length + 1, file.length), file);
                }
            }
        });
        if (dirList.length <= 0) {
            complete();
        }
    } while (dirList.length > 0);
}

var VIVOExternals = {};
var rootPath = null;
function addZipFile(zipObj, filePath, fullPath) {
    var fileExt = path.extname(fullPath); 
    if (fileExt === ".js") {
        var relativeToZipPath = fullPath.slice(rootPath.length + 1, fullPath.length);
        VIVOExternals[relativeToZipPath] = "commonjs " + relativeToZipPath;
    }
    zipObj.file(filePath, fs.readFileSync(fullPath));
}

function zipVIVOExternals(zipObj) {
    // 生成 webpack.config.js 文件，并添加到 zip 中
    var webpackName = "webpack.config.js";
    var webpackSource = path.join(__dirname, webpackName);
    var webpackFolder = zipObj.folder("config");
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

function onBeforeBuildFinish(event, options) {
    Editor.log('Checking config file ' + options.dest);
    // addZipFile 方法中获取文件相对于压缩包的路径
    rootPath = options.dest;
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
    rootPath = options.dest;

    var mainName = 'main.js';
    var resName = 'res';
    var srcName = 'src';
    var jsbAdapterName = 'jsb-adapter';

    var fileMain = path.join(options.dest, mainName);
    var dirRes = path.join(options.dest, resName);
    var dirSrc = path.join(options.dest, srcName);
    var dirAdapter = path.join(options.dest, jsbAdapterName);

    // var polyFilePath = path.join(__dirname, 'jsb_polyfill.js');
    // var srcPolyFilePath = path.join(dirSrc, 'jsb_polyfill.js');
    // fs.writeFileSync(srcPolyFilePath, fs.readFileSync(polyFilePath));

    //判断 res 与 src 是否遍历完成
    var isResComplete;
    var isSrcComplete;
    var isAdapterComplete;

    //生成压缩文件
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
                event.reply()
            });
    };

    //添加 main.js 文件
    addZipFile(jsZip, mainName, fileMain);
    //添加 game.config.json 文件
    addZipFile(jsZip, cfgName, projectCgfFile);
    //添加 res 目录中的文件
    walk(dirRes, [], function () {
        isResComplete = true;
        if (isSrcComplete && isAdapterComplete) {
            zip();
        }
    });
    //添加 src 目录中的文件
    walk(dirSrc, [], function () {
        isSrcComplete = true;
        if (isResComplete && isAdapterComplete) {
            zip();
        }
    });
    //添加 jsb-adapter 目录中的文件
    walk(dirAdapter, ["jsb-builtin.js"], function () {
        isAdapterComplete = true;
        if (isResComplete && isSrcComplete) {
            zip();
        }
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