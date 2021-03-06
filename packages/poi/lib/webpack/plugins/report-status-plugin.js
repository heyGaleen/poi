const path = require('path')
const os = require('os')
const chalk = require('chalk')
const prettyBytes = require('pretty-bytes')
const textTable = require('text-table')
const getIp = require('internal-ip')
const prettyMs = require('pretty-ms')
const formatWebpackMessages = require('@poi/dev-utils/formatWebpackMessages')
const clearConsole = require('@poi/dev-utils/clearConsole')
const pkg = require('../../../package')

class ReportStatusPlugin {
  constructor(options) {
    this.options = Object.assign({}, options)
  }

  apply(compiler) {
    compiler.hooks.done.tap('report-status', async stats => {
      if (this.options.clearConsole) {
        clearConsole()
      }

      if (stats.hasErrors()) {
        console.log(chalk.red.bold('Failed to compile:\n'))
        process.exitCode = 1
      }

      if (stats.hasErrors() || stats.hasWarnings()) {
        const messages = formatWebpackMessages(stats.toJson())
        for (const error of messages.errors) {
          console.log(error)
        }
        for (const warning of messages.warnings) {
          console.log(warning)
        }
        return
      }

      console.log(
        chalk.green.bold(
          `Built successfully in ${prettyMs(stats.endTime - stats.startTime)}!`
        )
      )

      if (
        this.options.mode === 'development' &&
        this.options.devServer.actualPort
      ) {
        const { host, port, actualPort, https } = this.options.devServer
        const protocol = https ? 'https://' : 'http://'
        const isAnyHost = host === '0.0.0.0'

        console.log(
          chalk.dim(
            this.options.electron
              ? `You can now load following URLs in your Electron app:\n`
              : `You can now preview the app via following URLs:\n`
          )
        )
        const getLocalAddress = color =>
          `${protocol}${isAnyHost ? 'localhost' : host}:${
            color ? chalk.bold(actualPort) : actualPort
          }`
        console.log(
          `- Local Server:       ${getLocalAddress(true)}${
            actualPort === port
              ? ''
              : chalk.yellow.italic(` (Port ${port} is in use)`)
          }`
        )
        if (this.options.open) {
          require('@poi/dev-utils/openBrowser')(getLocalAddress(false))
        }
        const ip = await getIp.v4()
        if (ip) {
          console.log(
            chalk.dim(`- On Your Network:    ${protocol}${ip}:${actualPort}`)
          )
        }
        console.log()
      }

      const outDir = path.relative(process.cwd(), compiler.options.output.path)

      if (this.options.showFileStats) {
        console.log()
        const fileStats = textTable(
          Object.keys(stats.compilation.assets)
            .sort((a, b) => {
              const delta = a.split('/').length - b.split('/').length
              if (delta > 0) {
                return 1
              }
              if (delta < 0) {
                return -1
              }
              return a > b ? 1 : -1
            })
            .map(filename => {
              const parsedPath = path.parse(path.join(outDir, filename))
              const prettyPath = `${chalk.dim(
                parsedPath.dir ? parsedPath.dir + '/' : ''
              )}${chalk.bold(parsedPath.base)}`
              const file = stats.compilation.assets[filename]
              const size = file.size()
              return [prettyPath, chalk.green.bold(prettyBytes(size))]
            }),
          {
            stringLength: require('string-width')
          }
        )
        console.log(fileStats)
      }

      if (this.options.mode === 'production') {
        console.log()
        console.log(
          chalk.dim(
            `Check out ${pkg.homepage}/guide/deployments for deployment guide.`
          )
        )
      }
    })

    compiler.hooks.invalid.tap('report-invalid', (filename, ctime) => {
      const d = new Date(ctime)
      const leftpad = v => (v > 9 ? v : `0${v}`)
      const prettyPath = p => p.replace(os.homedir(), '~')
      console.log(
        chalk.cyan(
          `[${leftpad(d.getHours())}:${leftpad(d.getMinutes())}:${leftpad(
            d.getSeconds()
          )}] Rebuilding due to changes made in ${prettyPath(filename)}`
        )
      )
    })
  }
}

ReportStatusPlugin.__expression = `require('poi/lib/webpack/plugins/report-status-plugin')`

module.exports = ReportStatusPlugin
