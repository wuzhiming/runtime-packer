// main.js
var path = require('path');
var fs = require('fs');
var JSZip = require('./lib/jszip.min.js');
var jsZip = new JSZip();

var rootPath;

function walk(dir, complete) {
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
            file = path.join(dirItem, file);
            var stat = fs.statSync(file);
            if (stat && stat.isDirectory()) {
                dirList.push(file);
                parentPathList.push(dirItem);
                parentZip.push(folder);
            } else {
                folder.file(file.slice(dirItem.length + 1, file.length), fs.readFileSync(file));
            }
        });
        if (dirList.length <= 0) {
            complete();
        }
    } while (dirList.length > 0);
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
    var cfgName = 'game.config.json';
    var projectCgfFile = path.join(Editor.projectPath, cfgName);
    if (!fs.existsSync(projectCgfFile)) {
        Editor.error('Can not find config file in ' + Editor.projectPath);
        writeConfigFile("portrait", false, "1.0.0", projectCgfFile);
        Editor.error('We have generated a config file for you in ' + Editor.projectPath + '/' + cfgName);
        Editor.error('Please modify the file and build again');
        Editor.error('Building cpk fail');
        event.reply();
        return;
    }

    Editor.log('Building cpk ' + options.platform + ' to ' + options.dest);
    rootPath = options.dest;

    var mainName = 'main.js';
    var resName = 'res';
    var srcName = 'src';

    var fileMain = path.join(options.dest, mainName);
    var dirRes = path.join(options.dest, resName);
    var dirSrc = path.join(options.dest, srcName);

    // var polyFilePath = path.join(__dirname, 'jsb_polyfill.js');
    // var srcPolyFilePath = path.join(dirSrc, 'jsb_polyfill.js');
    // fs.writeFileSync(srcPolyFilePath, fs.readFileSync(polyFilePath));

    //判断 res 与 src 是否遍历完成
    var isResComplete;
    var isSrcComplete;

    //生成压缩文件
    var zip = function () {
        var targetName = options.title + '.6.cpk';
        var dirTarget = path.join(options.dest, targetName);

        jsZip.generateNodeStream({ type: "nodebuffer", base64: false, compression: 'DEFLATE' })
            .pipe(fs.createWriteStream(dirTarget))
            .on('finish', function () {
                let outTips = Editor.T('EXPORT_ASSET.export_tips', { outPath: dirTarget });
                Editor.log(outTips);
                event.reply()
            });
    };

    //添加 main.js 文件
    jsZip.file(mainName, fs.readFileSync(fileMain));
    //添加 game.config.json 文件
    jsZip.file(cfgName, fs.readFileSync(projectCgfFile));
    //添加 res 目录中的文件
    walk(dirRes, function () {
        isResComplete = true;
        if (isSrcComplete) {
            zip();
        }
    });
    //添加 src 目录中的文件
    walk(dirSrc, function () {
        isSrcComplete = true;
        if (isResComplete) {
            zip();
        }
    });
}

module.exports = {
    name: 'OPPO 快游戏',
    platform: 'runtime',
    extends: Editor.isWin32 ? 'win32' : 'mac',
    messages: {
        'build-finished': onBeforeBuildFinish,
    },
};