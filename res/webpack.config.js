const fs = require('fs')
const path = require('path')
const pathSrc = path.join(process.cwd(), './src') 

function extractSourceFiles(zipReses, dir) {
	dir = dir || '.'
	let name
	let directory = path.join(pathSrc, dir)
	fs.readdirSync(directory)
    .forEach(function (file) {
      let fullpath = path.join(directory, file)
      let stat = fs.statSync(fullpath)
      let basename = path.basename(fullpath)
      let npath = fullpath.replace(/\\/g, '/')

      if (npath.indexOf('src/jsb-adapter') === -1 && npath.indexOf('src/src') === -1) return

      if (stat.isFile() ) {
        name = path.join('build', dir, path.basename(file))
        name = name.replace(/\\/g, '/')
        zipReses[name] = fullpath
      }
      else if (stat.isDirectory()) {
        var subdir = path.join(dir, file)
        extractSourceFiles(zipReses, subdir)
      }
    })	
}

module.exports = {
  postHook: function(webpackConf, options){
    // 设置externals
  	webpackConf.externals = Object.assign(webpackConf.externals || {}, EXTERNALS_PLACEHOLDER)

    // 包含转换文件
  	extractSourceFiles(options.zipReses)
  }
}
