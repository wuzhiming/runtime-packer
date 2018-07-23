// main.js
var path = require('path');
var fs = require('fs');
var JSZip = require('./lib/jszip.min.js');
var Hashes = require('./lib/hashes.min.js');

let RUNTIME_CONFIG;

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

function zipDir(dir, rootPath, zip, noZipFileList, complete) {
    var dirList = [dir];
    var parentPathList = [rootPath];
    var parentZip = [zip];
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
                    folder.file(file.slice(dirItem.length + 1, file.length), fs.readFileSync(file));
                }
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

function writeConfigFile(deviceOrientation, showStatusBar, runtimeVersion, subpackageArr, path) {
    var jsonObj = {
        "deviceOrientation": deviceOrientation,
        "showStatusBar": showStatusBar,
        "runtimeVersion": runtimeVersion,
        "subpackages": subpackageArr,
    };
    var jsonStr = JSON.stringify(jsonObj);
    fs.writeFileSync(path, jsonStr);
}

function onBeforeBuildFinish(event, options) {
    Editor.log('Checking config file ' + options.dest);
    var cfgName = 'game.config.json';
    var projectCgfFile = path.join(Editor.projectPath, cfgName);
    if (!fs.existsSync(projectCgfFile)) {
        var message = 'Can not find config file in ' + '\"' + Editor.projectPath + '\"';
        message = message + "\n\n" + 'We have generated a config file for you in ' + '\"' + Editor.projectPath + '/' + cfgName + '\"';
        message = message + "\n\n" + 'Please modify the file and build again';
        message = message + "\n\n" + 'Building cpk fail';
        Editor.Panel.open('cpk-publish', message);
        writeConfigFile("portrait", false, "1.0.0", [], projectCgfFile);
        Editor.failed('Building cpk fail');
        event.reply();
        return;
    }

    Editor.log('Building cpk ' + options.platform + ' to ' + options.dest);

    var mainName = 'main.js';
    var resName = 'res';
    var srcName = 'src';
    var jsbAdapterName = 'jsb-adapter';

    var fileMain = path.join(options.dest, mainName);
    var dirRes = path.join(options.dest, resName);
    var dirSrc = path.join(options.dest, srcName);
    var dirAdapter = path.join(options.dest, jsbAdapterName);
    var dirSubpackage = path.join(dirSrc, "assets");

    //判断 res 与 src 是否遍历完成
    var isResComplete;
    var isSrcComplete;
    var isAdapterComplete;

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
                var configStr = fs.readFileSync(projectCgfFile);
                var configJSON = JSON.parse(configStr);
                writeConfigFile(configJSON.deviceOrientation,
                    configJSON.showStatusBar,
                    configJSON.runtimeVersion,
                    subpackageArr,
                    projectCgfFile);
                event.reply();
            });
        });
    }

    //生成压缩文件
    var jsZip = new JSZip();
    var zip = function () {
        var targetName = options.title + '.cpk';
        var dirTarget = path.join(options.dest, targetName);

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
}

//先读取runtime相应的配置信息
function loadRuntimeSettings(event,options) {
    Editor.Profile.load('profile://project/cpk-publish.json', (err, ret) => {
        if (err) {
            //错误操作
            return;
        }
        RUNTIME_CONFIG = ret.data;
        onBeforeBuildFinish(event,options);
    });
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
        'build-finished': loadRuntimeSettings,
        'play'(event, options) {
            Editor.Ipc.sendToMain('oppo-runtime-devtools:open', options);
        },
    },
    builderUI: Editor.url('packages://cpk-publish/build-runtime-ui.js')
};