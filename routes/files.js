var express = require('express');
var router = express.Router();
var fs = require('fs');
var path = require('path');
const babelTraverse = require("@babel/traverse").default;
const babelParser = require("babylon")
const EventEmitter = require('events');
var dependencyTree = require('../lib/dependency-tree')
// var dependencyTree = require('dependency-tree')
let _ = require("underscore")

const libConfig = {
    vue: {
        path: 'E:/Workspace/Visualization/srcCodeHelperServer/data/vue',
        entry: 'src/platforms/web/entry-runtime-with-compiler.js',
        webpackConfig: 'src/vuePackConfig.js'
    },
    d3: {
        path: 'E:/Workspace/Visualization/srcCodeHelperServer/data/d3',
        entry: 'src/index.js',
        webpackConfig: 'src/d3PackConfig.js'
    }
}

router.get('/', function (req, res, next) {
    res.render('index', { title: 'Express' });
});

// 获取文件内容
router.get('/getFileContent', function (req, res, next) {
    let fname = req.query.filename
    fs.readFile(fname, 'utf8', (err, data) => {
        if (err) throw err;
        res.send({ content: data })
    });
});

// 只返回文件结构
router.get('/getFolderHierarchy', function (req, res, next) {
    const libName = req.query.libName,
        config = libConfig[libName]
    const root = getFileHierachy(config)
    res.send({root})
});

function getAllFiles(rootPath) {
    let blackList = ['.DS_Store','.eslintrc.json','LICENSE','dist','package.json','README.md','rollup.config.js','yarn.lock','yarn-error.log','locale','vuePackConfig.js','d3PackConfig.js'],
        fileList = []
    traverseDir(rootPath)
    function traverseDir(dir){
        var pa = fs.readdirSync(dir);
        pa.forEach(function (ele, index) {
            if (blackList.indexOf(ele) !== -1) return
            var curPath = path.resolve(dir, ele),
                info = fs.statSync(curPath)
            if (info.isDirectory()) {
                traverseDir(curPath);
            } 
            else {
                fileList.push(curPath)
            }
        })
    }
    return fileList
}

var depInfo = []

router.get('/getFilesInfo', function(req, res, next){
    const libName = req.query.libName,
        config = libConfig[libName],
    fileInfo = getFileInfo(depInfo, config)
    fileInfo.forEach(d => {
        d.fileInfo.depended = d.fileInfo.depended.length
        d.fileInfo.depending = d.fileInfo.depending.length
        d.fileInfo.direct = d.fileInfo.direct.length
        d.fileInfo.func = d.fileInfo.func.length
        d.fileInfo.indirect = d.fileInfo.indirect.length
        d.fileInfo.long = d.fileInfo.long.length
    })
    res.send(fileInfo)
})

router.get('/getDepsInfo', function(req, res, next){
    const libName = req.query.libName,
        config = libConfig[libName],
        lenThreshold = req.query.lenThreshold
    depInfo = getDepInfo(lenThreshold, config)
     // let badDeps = getDepInfo(0, config).badDeps
    // let num = 0
    // let fWriteName = 'graph.txt'
    // let fWrite = fs.createWriteStream(fWriteName)
    // let rootPath = path.join(config.path, '/src')
    // let fileList = getAllFiles(rootPath.replace(/\\/g, '\\\\'))
    // badDeps.forEach(deps => {
    //     num = num + deps.paths.length
    //     // 长依赖无环
    //     if(deps.type === 'long'){
    //         deps.paths.forEach(d => {
    //             let sourceIndex = fileList.indexOf(d.path[0])
    //             for(let i=1; i<d.path.length; i++){
    //                 let targetIndex = fileList.indexOf(d.path[i])
    //                 fWrite.write(sourceIndex + ',' + targetIndex)
    //                 fWrite.write('\n')
    //                 sourceIndex = targetIndex
    //             }
    //         }) 
    //     }
    //     else{
    //         deps.paths.forEach(d => {
    //             let sourceIndex = fileList.indexOf(d.path[0])
    //             for(let i=1; i<d.path.length; i++){
    //                 let targetIndex = fileList.indexOf(d.path[i])
    //                 fWrite.write(sourceIndex + ',' + targetIndex)
    //                 fWrite.write('\n')
    //                 sourceIndex = targetIndex
    //             }
    //             // 添加首尾相连
    //             sourceIndex = fileList.indexOf(d.path[d.path.length-1])
    //             targetIndex = fileList.indexOf(d.path[0])
    //             fWrite.write(sourceIndex + ',' + targetIndex)
    //             fWrite.write('\n')
    //         })  
    //     }   
    // })
    // let fWriteName1 = 'filelist.txt'
    // let fWrite1 = fs.createWriteStream(fWriteName1)
    // fileList.forEach(d=>{
    //     fWrite1.write(d)
    //     fWrite1.write('\n')
    // })
    // console.log(fileList.length)
    // console.log('finish writing and save success')
    // console.log('the total length:', num)
    res.send({badDeps: depInfo.badDeps, lenDis: depInfo.lenDis })
})


// 根据依赖id查找该依赖的细节信息
router.get('/getDetailBadDepInfoByDepId', function (req, res, next) {
    const { lenThreshold, depId, type, libName } = req.query
    depInfo = getDepInfo(lenThreshold, libConfig[libName])
    const { badDeps, depMap } = depInfo
    const detailPath = badDeps.find(d => d.type === type).paths.find(d => d.id === parseInt(depId)).path,
        len = detailPath.length
    // console.log(detailPath)
    let links = [],
        target,
        src
    // 构建node、link关系
    detailPath.forEach((val, idx) => {
        if (idx === len - 1) return
        src = val
        target = detailPath[idx + 1]
        const edge = depMap[src].find(d => d.src === target)
        links.push({
            source: src,
            target: edge.src,
            specifiers: edge.specifiers
        })
    })
    // 如果是循环依赖（直接或者间接），要把最后一条边信息补上
    if (type === 'indirect' || type === 'direct') {
        src = detailPath[len - 1]
        target = detailPath[0]
        links.push({
            source: src,
            target,
            specifiers: depMap[src].find(d => d.src === target).specifiers
        })
    }
    res.send({
        nodes: detailPath,
        links
    })
})

// 返回文件的依赖信息：三种坏依赖关系数组，依赖图的邻接表表示
function getDepInfo(lenThreshold, config) {
    let arr = [],
        maxLen = -1,
        depMapInfo = new dependencyTree({
            filename: path.resolve(config.path, config.entry),
            directory: path.resolve(config.path),
            webpackConfig: config.webpackConfig ? path.resolve(config.path, config.webpackConfig) : null, // optional
            nonExistent: arr, // optional
            lenThreshold
        })
    maxLen = depMapInfo.depHell.long.slice().sort((a, b) => b.length - a.length)[0].length
    // console.log(depMapInfo)
    return {
        badDeps: [{ type: 'long', paths: backWardsCompat(depMapInfo.depHell.long, 0, 'long'), threshold: lenThreshold, maxLen },
        { type: 'indirect', paths: backWardsCompat(depMapInfo.depHell.indirect, depMapInfo.depHell.long.length, 'indirect') },
        { type: 'direct', paths: backWardsCompat(depMapInfo.depHell.direct, depMapInfo.depHell.indirect.length, 'direct') }
        // { type: 'scc', paths: [] }
        ],
        depMap: depMapInfo.depMap,
        lenDis: depMapInfo.lenDis
    }
}

// 对用新逻辑获取的badDeps进行向后接口的兼容
function backWardsCompat(deps, offset, type) {
    return deps.map((d) => ({
        id: offset++,
        path: d,
        type
    }))
}

// 返回文件夹的层次结构
function getFileHierachy(config) {
    let directory = path.resolve(config.path, 'src'),
        root = {
            name: directory,
            type: 'dir',
            children: []
        },
        blackList = ['.DS_Store','.eslintrc.json','LICENSE','dist','package.json','README.md','rollup.config.js','yarn.lock','yarn-error.log','locale','vuePackConfig.js','d3PackConfig.js']
    let id = 0
    readDirSync(directory, root)
    let depth = getTreeDepth(root)
    equalizeDepth(root, depth)
    return root

    function readDirSync(rootPath, root) {
        var pa = fs.readdirSync(rootPath);
        pa.forEach(function (ele, index) {
            if (blackList.indexOf(ele) !== -1) return
            var curPath = path.resolve(rootPath, ele),
                info = fs.statSync(curPath)
            if (info.isDirectory()) {
                let tmpdir = { name: curPath, children: [], type: 'dir' }
                root.children.push(tmpdir)
                readDirSync(curPath, tmpdir);
            } else {
                root.children.push({
                    name: curPath,
                    type: 'file',
                    id: id++
                })
            }
        })
    }
}

//返回文件的基本统计信息（文件大小、文件所包含函数、依赖和被依赖文件，坏依赖数）
function getFileInfo({ badDeps, depMap },config) {
    let directory = path.resolve(config.path, 'src'),
        blackList = ['.DS_Store','.eslintrc.json','LICENSE','dist','package.json','README.md','rollup.config.js','yarn.lock','yarn-error.log','locale','vuePackConfig.js','d3PackConfig.js']
    let fileInfo = [], id = 0
    readFileSync(directory, fileInfo)
    return fileInfo

    function readFileSync(rootPath, fileInfo) {
        var pa = fs.readdirSync(rootPath);
        pa.forEach(function (ele, index) {
            if (blackList.indexOf(ele) !== -1) return
            var curPath = path.resolve(rootPath, ele),
                info = fs.statSync(curPath)
            if (info.isDirectory()) {
                readFileSync(curPath, fileInfo);
            } else {
                fileInfo.push({
                    id: id++,
                    name: curPath,
                    fileInfo: Object.assign({}, { size: info.size },
                        extractFunc(curPath),
                        extractBadDeps(curPath, badDeps),
                        extractFileDep(curPath, depMap)
                    )
                })
            }
        })
    }
}

// 提取函数信息：lineNum和name
function extractFunc(fpath) {
    const code = fs.readFileSync(fpath, "utf-8"),
        fileInfo = { func: [] },
        visitor = {
            FunctionDeclaration(path) {
                const loc = path.node.loc
                path.node.id && fileInfo.func.push({
                    lineNum: loc.end.line - loc.start.line + 1,
                    name: path.node.id.name
                })
            }
        }
    let ast = null
    try {
        ast = babelParser.parse(code, {
            // parse in strict mode and allow module declarations
            sourceType: "module",
            plugins: [
                // enable jsx and flow syntax
                "flow"
            ]
        })
    } catch (e) {
        console.log(e)
        console.log(fpath)
        process.exit(1)
    }
    babelTraverse(ast, visitor);
    return fileInfo;
}

// 提取坏依赖：长依赖、间接依赖和直接依赖
function extractBadDeps(fpath, badDeps) {
    const fileBadDeps = {}
    for (let dep of badDeps) {
        let type = dep.type,
            paths = dep.paths,
            filteredDeps = paths.filter(d => d.path.indexOf(fpath) !== -1)
        fileBadDeps[type] = filteredDeps
    }
    return fileBadDeps
}

// 提取文件依赖
function extractFileDep(fpath, depMap) {
    let depending = depMap[fpath] || [],
        depended = [],
        val, idx;
    Object.keys(depMap).forEach((key) => {
        val = depMap[key]
        idx = val.findIndex(d => d.src === fpath)
        if (idx !== -1) {
            depended.push({
                src: val[idx].src,
                specifiers: val[idx].specifiers   // specifier包含type和name, type指的是import、export等, name指函数名 
            })
        }
    })
    return {
        depending,
        depended
    }
}

function getTreeDepth(root) {
    let maxLen = -1

    function dfs(root, len) {
        if (!root.children) {
            if (len > maxLen)
                maxLen = len
            return
        }
        for (let i = 0; i < root.children.length; i++) {
            dfs(root.children[i], len + 1)
        }
    }
    dfs(root, 0)
    return maxLen
}

// 使所有的文件在同一层
function equalizeDepth(root, depth) {
    function dfs(root, len) {
        if (root.type === 'file') {
            let tmpSize = root.size,
                rootStr
            //only leaves in the resulting dendrogram should contain 'size' prop
            delete root.size
            rootStr = JSON.stringify(root)
            while (len < depth) {
                let tmp = JSON.parse(rootStr)
                root.children = [tmp]
                root = tmp
                len++
            }
            root.size = tmpSize
            return
        }
        for (let i = 0; i < root.children.length; i++) {
            dfs(root.children[i], len + 1)
        }
    }
    dfs(root, 0)
}


module.exports = router;