'use strict';

const fs = require('fs');
const path = require('path');
const shell = require('shelljs');
const child_process = require('child_process');
const requireg = require('requireg');

const UtilFs = require('../utils/fs.js');

// 已指定 node 版本则不再强制使用 node 6
let switchNodeCmd = 'echo ""';
if(!process.env.NODE_VER) {
    switchNodeCmd = 'export PATH=/usr/local/n/versions/node/6.2.1/bin:$PATH';
}

exports.usage = '线上编译';

exports.setOptions = (optimist) => {
    optimist.alias('m', 'min');
    optimist.describe('m', '是否压缩资源');
};

exports.npmInstall = function() {
    let currentNpm = null;
    const cwd = process.cwd();

    // 检测是否存在 ykit.*.js
    const configFile = globby.sync(['ykit.*.js', 'ykit.js'], { cwd: cwd })[0];
    if(!configFile) {
        logError('Local ykit.js not found in' + cwd);
        process.exit(1);
    }

    // 检测是否存在 node_modules
    const isNodeModulesExists = fs.existsSync(sysPath.join(cwd, 'node_modules'));
    if(isNodeModulesExists) {
        logError('Find node_modules in the current directory which can cause compilation failure.');
        logError('Please remove it from your registry.');
        logInfo('Visit ' + 'http://ued.qunar.com/ykit/docs-%E5%8F%91%E5%B8%83.html'.underline + ' for doc.');
        process.exit(1);
    }

    let ncsEnabled = true;

    const ykitOptions = require(sysPath.join(cwd, 'package.json')).ykit || {};
    if(ykitOptions.skipNpmCache) {
        ncsEnabled = false;
    } else {
        try {
            child_process.execSync('npm_cache_share');
        } catch (e) {
            ncsEnabled = false;
        }
    }

    if(UtilFs.fileExists(sysPath.join(cwd, 'yarn.lock'))) {
        checkModuleResolvePath(sysPath.join(cwd, 'yarn.lock'));
        currentNpm = ncsEnabled ? 'npm_cache_share' : 'yarn';
        log(`Installing npm modules with ${ncsEnabled ? 'npm_cache_share + ' : ''}yarn.`);
    } else if(UtilFs.fileExists(sysPath.join(cwd, 'npm-shrinkwrap.json'))) {
        checkModuleResolvePath(sysPath.join(cwd, 'npm-shrinkwrap.json'));
        currentNpm = ncsEnabled ? 'npm_cache_share' : 'npm';
        log(`Installing npm modules with ${ncsEnabled ? 'npm_cache_share + ' : ''}npm.`);
    } else {
        currentNpm = 'npm';
        log('Installing npm modules with npm.');
        logWarn('Please use yarn or shrinkwrap to lock down the versions of packages.');
        logDoc('http://ued.qunar.com/ykit/docs-npm%20shrinkwrap.html');
    }

    // install
    let installParams = '--registry https://repo.corp.qunar.com/artifactory/api/npm/npm-qunar ';
    if(currentNpm === 'npm_cache_share') {
        installParams += '-d';
    } else if (currentNpm === 'yarn') {
        installParams += '--non-interactive';
    }
    const installCmd = (
        `${currentNpm} install ${installParams}`
    );

    execute(installCmd);
};

exports.run = function(options) {
    const min = !(options.m === 'false' || options.min === 'false');

    // display version info
    process.stdout && process.stdout.write('node version: ') && execute('node -v');
    process.stdout && process.stdout.write('npm version: ') && execute('npm -v');
    execute('ykit -v');

    // build
    log('Start building.');
    execute(`ykit pack -q ${min ? '-m' : ''}`);
    clearGitHooks();
    clearNodeModules();
    log('Finish building.\n');
};

function execute(cmd) {
    if (!cmd) {
        return;
    }

    if(switchNodeCmd) {
        cmd = switchNodeCmd + ' && ' + cmd;
    }

    const child = shell.exec(cmd, {
        silent: false,
        async: false
    });

    if (child.code !== 0) {
        logError('Building encounted error while executing ' + cmd);
        process.exit(1);
    }

    return;
}

function clearGitHooks() {
    const gitHooksDir = './.git/hooks/';

    if (UtilFs.dirExists(gitHooksDir)) {
        fs.readdirSync(gitHooksDir).forEach(function(file) {
            const currentPath = path.join(gitHooksDir, file);
            fs.writeFileSync(currentPath, '');
        });
        log('Local git hooks have been cleared.');
    }
}

function clearNodeModules() {
    shell.rm('-rf', 'node_modules');
    log('Local node_modules directory has been cleared.');
}

function checkModuleResolvePath(filePath) {
    const lockFileName = path.basename(filePath);
    const lockFileContent = fs.readFileSync(filePath, 'utf-8');
    const npmjsPathMatchResult = lockFileContent.match(/registry\.npmjs\.org/g);
    if(npmjsPathMatchResult) {
        logWarn(
            `According to ${lockFileName}, `
            + `there are ${npmjsPathMatchResult.length} packages installed from official registry`
            + '(https://registry.npmjs.org/). '
            + 'This may slow down the build process.'
        );
        logDoc('https://ykit.ymfe.org/docs-npm%20shrinkwrap.html');
    }
}
