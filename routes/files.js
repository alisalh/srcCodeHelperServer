var express = require('express');
var router = express.Router();
var fs = require('fs');
var path = require('path');
const babelTraverse = require("@babel/traverse").default;
const babelParser = require("@babel/parser")
const EventEmitter = require('events');
var dependencyTree = require('dependency-tree')
let _ = require("underscore")
const vueSrc = '/Users/wendahuang/Desktop/vue/';
// console.log(pathInfo)
// console.log(pathInfo)
/* GET home page. */
router.get('/', function(req, res, next) {
    res.render('index', { title: 'Express' });
});

router.get('/getFileDeps', function(req, res, next) {
    var srcDir = 'E:\\srcCodeHelper\\node_modules\\vue\\src',
        fileInfo = []
    // filePath = path.resolve(rootDir),
    extractDirFilePath(srcDir, fileInfo)
    // console.log(fileInfo)
    enrichFileInfo(srcDir, fileInfo).then(function() {
        let allDeps = fileInfo.map(d => d.deps).reduce((a, b) => a.concat(b))
        // res.send(allDeps)
        // res.send(extractModuleDep(allDeps))
        res.send(fileInfo)
    })
    // res.send("world")

    // var filePath=path.resolve('E:\\srcCodeHelper\\src\\utils') 
    /*    let deps = []
        fileDisplay(filePath, deps, rootDir);
        let moduleDeps = extractModuleDep(deps)

        res.send(moduleDeps)*/
});

function extractReferredCnt(fileInfo, allDeps) {

}

function pathResolve(customPath, fileInfo) {
    let file = fileInfo.find(function(d) {
        return d.path.indexOf(customPath.replace(/\//g, '\\')) !== -1
    })
    if (file === undefined) {
        console.log(customPath)
        return "unknownPath"
    } else {
        return file.path
    }
}

function extractDirFilePath(filePath, fileInfo) {
    //根据文件路径读取文件，返回文件列表  
    let files = fs.readdirSync(filePath)
    //遍历读取到的文件列表  
    files.forEach(function(filename) {
        //获取当前文件的绝对路径  
        var filedir = path.join(filePath, filename),
            stats = fs.statSync(filedir)
        //根据文件路径获取文件信息，返回一个fs.Stats对象

        var isFile = stats.isFile(); //是文件  
        var isDir = stats.isDirectory(); //是文件夹  
        if (isFile) {
            fileInfo.push({ path: filedir, size: stats.size })
        }
        if (isDir) {
            extractDirFilePath(filedir, fileInfo) //递归，如果是文件夹，就继续遍历该文件夹下面的文件  
        }
    })
}

function sameModule(a, b, srcDir) {
    srcDir = srcDir.replace(/\\/g, '\\\\')
    let moduleRe = new RegExp(`${srcDir}\\\\([^\\\\]*)`),
        moduleA = a.match(moduleRe)[1],
        moduleB = b.match(moduleRe)[1]
    return moduleA === moduleB
}

function extractDep(d, srcDir, content, fileInfo) {
    let deps = [],
        importRe = /\s*import\s*{\s*(\S*)\s*}\s*from\s*'([^']*)'/g,
        absRelPathRe = /^[\/\.]/,
        jsSuffixRe = /(\.js)$/,
        searchRes, importPath
    while ((searchRes = importRe.exec(content)) !== null) {
        importPath = searchRes[2]
        if (!jsSuffixRe.test(importPath))
            importPath += '.js'
        if (!absRelPathRe.test(importPath))
            deps.push({ src: d.path, ref: pathResolve(importPath, fileInfo) })
        else deps.push({ src: d.path, ref: path.resolve(path.dirname(d.path), importPath) })

        let dep = deps[deps.length - 1],
            refFile = fileInfo.find(d => d.path === dep.ref)
        if (refFile === undefined) {
            console.log("undefined refFile", dep.ref)
        }
        // sameModule(dep.src,dep.ref,srcDir)
        if (sameModule(dep.src, dep.ref, srcDir)) {
            refFile.innerRef || (refFile.innerRef = 0)
            refFile.innerRef++
        } else {
            refFile.outerRef || (refFile.outerRef = 0)
            refFile.outerRef++
        }
    }
    d.deps = deps
}

function extractImportExportRatio(content) {
    let importRe = /\s*import\s*{?([^}]*)}?\s*from\s*'([^']*)'/g,
        searchRes, importFuncs
    while ((searchRes = importRe.exec(content)) !== null) {
        importFuncs = searchRes[1].replace(/\s/g, '').split(',')
    }

}

function enrichFileInfo(srcDir, fileInfo) {
    let promiseArr = fileInfo.map(d => new Promise(function(resolve) {
        fs.readFile(d.path, 'utf8', function(err, content) {
            // console.log(d.name,content)
            extractDep(d, srcDir, content, fileInfo)
            // d.importExportRatio = extractImportExportRatio(content)
            resolve()
        })
    }))
    return Promise.all(promiseArr)
}



function extractModuleDep(deps) {
    let moduleDeps = [],
        re = /E:\\srcCodeHelper\\node_modules\\vue\\src\\[^\\]*/,
        srcGroup, refGroup
    srcGroup = _.groupBy(deps, function(d) {
        let src = d.src
        return src.match(re)[0]
    });
    // console.log(srcGroup)
    Object.keys(srcGroup).forEach(function(srcKey) {
        refGroup = _.groupBy(srcGroup[srcKey], function(d) {
            let ref = d.ref
            return ref.match(re)[0]
        })
        Object.keys(refGroup).forEach(function(refKey) {
            moduleDeps.push({ srcModule: srcKey, refModule: refKey, deps: refGroup[refKey] })

        })
    })
    return moduleDeps
}

//get 'deps'
router.get('getFileInfo', function(req, res, next) {
    let arr = []
    let tree = dependencyTree({
        filename: 'C:\\Users\\yunyou\\Desktop\\workspace\\node_modules\\vue\\src\\platforms\\web\\entry-runtime-with-compiler.js',
        directory: 'C:\\Users\\yunyou\\Desktop\\workspace\\node_modules\\vue',
        webpackConfig: 'C:\\Users\\yunyou\\Desktop\\workspace\\node_modules\\vue\\src\\vuePackConfig.js', // optional
        nonExistent: arr // optional
    });


})

router.get('/getFolderHierarchyAndFileInfo', function(req, res, next) {
    const lenTreshold = req.query.lenTreshold,
        { badDeps, fileDep } = getDepInfo(lenTreshold)
    const root = getFileInfo(badDeps, fileDep)
    res.send({ root, badDeps })

});

// 返回文件的依赖信息：三种坏依赖关系数组，每个文件的依赖和被依赖文件数组
function getDepInfo(lenTreshold) {
    let curPath = [],
        // lenTreshold = 22,
        longPaths = [],
        directCirclePaths = [],
        indirectCirclePaths = [],
        arr = [],
        longPathSet = new Set(),
        directCirclePathSet = new Set(),
        indirectCirclePathSet = new Set(),
        longestPathLen = -1,
        fileInfoMap = {},
        depIdx = 0
    /**
     * 依赖树数据结构
     * {
     *     a{
     *         specifiers{
     *             depending:[{
     *                 type:ImportSpecifier|ImportDefaultSpecifier|ImportNamespaceSpecifier|ExportSpecifier|ExportAllSpecifier,
     *                 name
     *             }],
     *             depended:
     *         }
     *         b{specifiers}
     *     }
     *     c{}
     * }
     */
    let tree = dependencyTree({
        filename: path.resolve(vueSrc, 'src/platforms/web/entry-runtime-with-compiler.js'),
        directory: path.resolve(vueSrc),
        webpackConfig: path.resolve(vueSrc, 'src/vuePackConfig.js'), // optional
        nonExistent: arr // optional
    });
    // console.log(tree)
    traverse(Object.keys(tree)[0], null, tree[Object.keys(tree)[0]])
    directCirclePaths = [...directCirclePathSet].map(d => ({ id: depIdx++, path: d.split('|'), type: 'direct' }))
    indirectCirclePaths = [...indirectCirclePathSet].map(d => ({ id: depIdx++, path: d.split('|'), type: 'indirect' }))
    longPaths = [...longPathSet].map(d => ({ id: depIdx++, path: d.split('|'), type: 'long' }))

    function traverse(cur, prev, val) {
        if (!val) {
            console.log('cur', cur)
            console.log('prev', prev)
            console.log('val', val)
            return
        }
        const childKey = Object.keys(val).filter(d => d !== 'specifiers')
        if (prev !== null) {
/*            console.log({
                file: prev,
                specifiers: val.specifiers
            })*/
            // 获取文件的依赖和被依赖文件信息，prev->cur表示prev依赖于cur
            if(prev==='/Users/wendahuang/Desktop/vue/src/core/util/index.js' && 
                cur==='/Users/wendahuang/Desktop/vue/src/core/observer/index.js'){
                console.log(prev,cur)
                console.log('------------')
                console.log(JSON.stringify(val.specifiers,null,1))
            }
            fileInfoMap[cur] || (fileInfoMap[cur] = fileFactory())
            fileInfoMap[prev] || (fileInfoMap[prev] = fileFactory())
            fileInfoMap[cur].depended.add(JSON.stringify({
                file: prev,
                specifiers: val.specifiers
            }))
            fileInfoMap[prev].depending.add(JSON.stringify({
                file: cur,
                specifiers: val.specifiers
            }))
        }
        curPath.push(cur)
        if (childKey.length === 0) {
            let tmpPath = curPath.slice()
            // a circle is detected if the last number happens before
            // note that the circle path doesnt connect the last node to the first node
            let idx = tmpPath.indexOf(tmpPath[tmpPath.length - 1])
            if (idx !== tmpPath.length - 1) {
                tmpPath = tmpPath.slice(idx, tmpPath.length - 1)
                if (tmpPath.length === 2)
                    directCirclePathSet.add(tmpPath.join("|")) //'|' is used to  serve as the delimiter for join and split
                else if (tmpPath.length > 2)
                    indirectCirclePathSet.add(tmpPath.join("|"))
            } else {
                if (tmpPath.length > longestPathLen)
                    longestPathLen = tmpPath.length
                if (tmpPath.length > lenTreshold) {
                    longPathSet.add(tmpPath.join("|"))
                }
            }
        }
        for (let key of childKey) {
            traverse(key, cur, val[key])
        }
        curPath.pop()
    }
    return {
        badDeps: [{ type: 'long', paths: longPaths, threshold: lenTreshold, longestPathLen },
            { type: 'indirect', paths: indirectCirclePaths },
            { type: 'direct', paths: directCirclePaths },
            { type: 'scc', paths: [] }
        ],
        fileDep: fileInfoMap
    }
}

function fileFactory() {
    return {
        depending: new Set(),
        depended: new Set()
    }
}

// 返回文件夹的层次结构，以及文件的基本统计信息（文件大小、文件所包含函数、依赖和被依赖文件，坏依赖数）
function getFileInfo(badDeps, fileDep) {
    let directory = path.resolve(vueSrc, 'src'),
        root = {
            name: directory,
            type: 'dir',
            children: []
        },
        blackList = ['.DS_Store']
    readDirSync(directory, root)
    let depth = getTreeDepth(root)
    // console.log(depth)
    equalizeDepth(root, depth)
    return root

    function readDirSync(rootPath, root) {
        var pa = fs.readdirSync(rootPath);
        pa.forEach(function(ele, index) {
            // console.log(ele)
            if (blackList.indexOf(ele) !== -1) return
            var curPath = path.resolve(rootPath, ele),
                info = fs.statSync(curPath)
            if (info.isDirectory()) {
                // console.log("dir: "+ele)
                let tmpdir = { name: curPath, children: [], type: 'dir' }
                root.children.push(tmpdir)
                readDirSync(curPath, tmpdir);
            } else {
                root.children.push({
                    name: curPath,
                    type: 'file',
                    fileInfo: Object.assign({}, { size: info.size },
                        extractFunc(curPath),
                        extractBadDeps(curPath, badDeps),
                        extractFileDep(curPath, fileDep))
                })
                // console.log("file: "+ele)  
            }
        })
    }
}

function extractFunc(fpath) {
    const code = fs.readFileSync(fpath, "utf-8"),
        fileInfo = { func: [] },
        ast = babelParser.parse(code, {
            // parse in strict mode and allow module declarations
            sourceType: "module",
            plugins: [
                // enable jsx and flow syntax
                "flow"
            ]
        }),
        visitor = {
            FunctionDeclaration(path) {
                const loc = path.node.loc
                fileInfo.func.push({
                    lineNum: loc.end.line - loc.start.line + 1,
                    name: path.node.id.name
                })
            }
        }

    babelTraverse(ast, visitor);
    return fileInfo;
}

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

function set2ArrInObj(obj) {
    let keys = Object.keys(obj)
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i]
        obj[key] = Array.from(obj[key]).map((d)=>JSON.parse(d))
    }
    return obj
}

function extractFileDep(fpath, fileDep) {
    return fileDep[fpath] ? set2ArrInObj(fileDep[fpath]) : set2ArrInObj(fileFactory())
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