const { src, dest, parallel, watch, series } = require('gulp');
const loadPlugins = require('gulp-load-plugins');
const plugins = loadPlugins();

const del = require('del');

const browserSync = require('browser-sync');
const bs = browserSync.create();

const cwd = process.cwd();
let config = {
    // default config
    build: {
        src: 'src',
        dist: 'dist',
        temp: 'temp',
        public: 'public',
        paths: {
            styles: 'assets/styles/*.scss',
            scripts: 'assets/scripts/*.js',
            pages: '*.html',
            images: 'assets/images/**',
            fonts: 'assets/fonts/**',
        }
    }
};
try {
    const loadConfig = require(path.join(cwd, 'pages.config.js'));
    config = Object.assign({}, config, loadConfig);
} catch (err) { }


const clean = () => {
    return del([config.build.dist, config.build.temp])
}

const style = () => {
    return src(config.build.paths.styles, { base: config.build.src, cwd: config.build.src })
        .pipe(plugins.sass({
            outputStyle: 'expanded'
        }))
        .pipe(dest(config.build.temp))
        .pipe(bs.reload({ stream: true }));
}

const script = () => {
    return src(config.build.paths.scripts, { base: config.build.src, cwd: config.build.src })
        .pipe(plugins.babel({
            presets: [require('@babel/preset-env')],
        }))
        .pipe(dest(config.build.temp))
        .pipe(bs.reload({ stream: true }));
}

const page = () => {
    // 只处理src下的html文件
    return src(config.build.paths.pages, { base: config.build.src, cwd: config.build.src })
        .pipe(plugins.swig({ data: config.data }))
        .pipe(dest(config.build.temp))
        .pipe(bs.reload({ stream: true }));
}

const image = () => {
    return src(config.build.paths.images, { base: config.build.src, cwd: config.build.src })
        .pipe(plugins.imagemin())
        .pipe(dest(config.build.dist))
}

const font = () => {
    return src(config.build.paths.fonts, { base: config.build.src, cwd: config.build.src })
        .pipe(plugins.imagemin())
        .pipe(dest(config.build.dist));
}

const extra = () => {
    return src('**', { base: config.build.public, cwd: config.build.public })
        .pipe(dest(config.build.dist));
}

function isFixed(file) {
    return file.eslint != null && file.eslint.fixed;
}

function isProduction() {
    return process.argv.slice(2).includes('--production');
}

const lint = () => {
    return src(config.build.paths.scripts, { base: config.build.src, cwd: config.build.src })
        .pipe(plugins.eslint({
            fix: true, // 是否修复
            "envs": ['browser'],
            "parserOptions": {
                "ecmaVersion": 6,
                "sourceType": "module"
            },
            "rules": {
                "semi": 2, // 结束行末需要分号
                "camelcase": 1,
                "quotes": 0
            }
        }))
        // 执行代码格式化
        .pipe(plugins.eslint.format())
        // 如果修复完成，写回原文件
        .pipe(plugins.if(isFixed, dest(config.build.src)))
        // 如果生产环境下 发生错误，终止任务
        .pipe(plugins.if(isProduction, plugins.eslint.failAfterError()));

}

const serve = () => {

    // 监视js/css/html文件改变，执行对应的构建任务
    watch(config.build.paths.scripts, { cwd: config.build.src }, script);
    // js 改变执行代码检查修复
    watch(config.build.paths.scripts, { cwd: config.build.src }, lint);

    watch(config.build.paths.styles, { cwd: config.build.src }, style);
    watch(config.build.paths.pages, { cwd: config.build.src }, page);

    // 以下目录中的文件改变，不需要执行构建任务，只需要刷新浏览器
    watch([
        config.build.paths.images,
        config.build.paths.fonts
    ], { cwd: config.build.src }, bs.reload)

    watch('**', { cwd: config.build.public }, bs.reload)

    bs.init({
        notify: false,
        port: 2080,
        // open: false, //自动打开浏览器
        // files: 'temp/**', // 监视文件改变
        server: {
            baseDir: [config.build.temp, config.build.dist, config.build.public],
            routes: { // 映射资源文件
                '/node_modules': 'node_modules', // 路径以/node_modules开头的文件，从当前的node_modules目录中寻找
            }
        }
    })
}

// 处理html中的文件引用
const useref = () => {
    return src(config.build.paths.pages, { base: config.build.temp, cwd: config.build.temp })
        .pipe(plugins.useref({ searchPath: [config.build.temp, '.'] }))
        .pipe(plugins.if(/\.js$/, plugins.uglify()))
        .pipe(plugins.if(/\.css$/, plugins.cleanCss()))
        .pipe(plugins.if(/\.html$/, plugins.htmlmin({
            collapseWhitespace: true,
            minifyCSS: true,
            minifyJS: true,
        })))
        .pipe(dest(config.build.dist));
}

// build 任务，并行执行 style，script，page 任务
// script 任务之前 先执行代码检查
const build = parallel(style, series(lint, script), page);

// start 任务， 一般是在本地进行开发时使用的，需要执行build 和 serve 任务
const start = series(build, serve);

// 发布生产
const deploy = series(clean, parallel(series(build, useref), image, font, extra));

module.exports = {
    clean,
    build,
    start,
    lint,
    serve,
    deploy
}