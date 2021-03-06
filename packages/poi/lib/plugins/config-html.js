const path = require('path')
const fs = require('fs')

exports.apply = api => {
  if (api.config.target !== 'app' && api.config.target !== 'electron') return

  api.chainWebpack(config => {
    // Split vendors and common chunks
    if (api.mode === 'production') {
      config.optimization.splitChunks({
        cacheGroups: {
          vendors: {
            name: `chunk-vendors`,
            test: /[\\/]node_modules[\\/]/,
            priority: -10,
            chunks: 'initial'
          },
          common: {
            name: `chunk-common`,
            minChunks: 2,
            priority: -20,
            chunks: 'initial',
            reuseExistingChunk: true
          }
        }
      })
    }

    // Generate HTML files for each entry
    const HtmlPlugin = require('html-webpack-plugin')
    HtmlPlugin.__expression = `require('html-webpack-plugin')`

    const DEFAULT_TEMPLATE = path.join(__dirname, '../default-template.html')
    const templateParametersGenerator = (compilation, assets, options) => {
      return {
        compilation,
        webpack: compilation.getStats().toJson(),
        webpackConfig: compilation.options,
        htmlWebpackPlugin: {
          files: assets,
          options
        },
        envs: api.getEnvs(),
        constants: api.config.contants
      }
    }

    const getDefaultTemplate = () => {
      return (
        api.config.defaultHtmlTemplate ||
        (fs.existsSync(api.resolve('public/index.html'))
          ? api.resolve('public/index.html')
          : DEFAULT_TEMPLATE)
      )
    }
    if (api.config.pages) {
      for (const entryName of Object.keys(api.config.pages)) {
        const page = Object.assign(
          {
            template: getDefaultTemplate(),
            templateParametersGenerator,
            title: api.pkg.data.name || 'Poi App',
            filename: `${entryName}.html`,
            chunks: ['chunk-vendors', 'chunk-common', entryName]
          },
          api.config.pages[entryName]
        )
        page.template = api.resolve(page.template)
        config.plugin(`html-page-${entryName}`).use(HtmlPlugin, [page])
      }
    } else {
      const page = Object.assign(
        {
          template: getDefaultTemplate(),
          templateParametersGenerator,
          title: api.pkg.data.name || 'Poi App',
          filename: 'index.html'
        },
        api.config.html
      )
      page.template = api.resolve(page.template)
      config.plugin('html').use(HtmlPlugin, [page])
    }
  })
}

exports.name = 'builtin:config-html'
