var Walker = require('node-source-walk');
var debug = require('debug')('detective-es6');
const fs = require('fs');
/**
 * Extracts the dependencies of the supplied es6 module
 *
 * @param  {String|Object} src - File's content or AST
 * @return {String[]}
 */
module.exports = function(filename) {
    var src = fs.readFileSync(filename, 'utf8');
    var walker = new Walker();

    var dependencies = [],
        depSpecifiers = [], 
        referenceName = [];

    if (typeof src === 'undefined') { throw new Error('src not given'); }

    if (src === '') {
        return dependencies;
    }

    walker.walk(src, function(node) {
        // console.log(node.type+':'+node.source.value)
        switch (node.type) {
            case 'ImportDeclaration':
                // _highlight('ImportDeclaration')
                if (node.source && node.source.value) {
                    depSpecifiers = []
                    referenceName = []
                    const specifiers = node.specifiers
                    specifiers.forEach((d) => {
                        depSpecifiers.push({
                            type: d.type,
                            name: d.local.name
                        })
                        referenceName.push(d.local.name)
                    })
                    dependencies.push({ src: node.source.value, specifiers: depSpecifiers, referenceName: referenceName});
                }
                break;
            case 'ExportNamedDeclaration':
                if (node.source && node.source.value) {
                    // _highlight('ExportNamedDeclaration')
                    depSpecifiers = []
                    referenceName = []
                    const specifiers = node.specifiers
                    specifiers.forEach((d) => {
                        depSpecifiers.push({
                            type: d.type,
                            name: d.local.name
                        })
                        referenceName.push(d.exported.name)
                    })
                    dependencies.push({ src: node.source.value, specifiers: depSpecifiers, referenceName: referenceName});
                }
                break;
            case 'ExportAllDeclaration':
                if (node.source && node.source.value) {
                    // _highlight('ExportAllDeclaration')
                    dependencies.push({ src: node.source.value, specifiers: [{ type: 'exportAllSpecifier', name: null }] });
                }
                break;
            case 'CallExpression':
                if (node.callee.type === 'Import' && node.arguments.length) {
                    // _highlight('CallExpression', src)
                    dependencies.push(node.arguments[0].value);
                }
            default:
                return;
        }
    });
    // _highlight('deps in detective-es6:')
    // _highlight(JSON.stringify(dependencies))
    return dependencies;
};