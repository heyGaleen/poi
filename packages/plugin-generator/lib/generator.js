const path = require('path')
const fs = require('fs-extra')
const chalk = require('chalk')
const { prompt } = require('inquirer')
const compileTemplate = require('lodash.template')
const resolveFrom = require('resolve-from')
const parsePackageName = require('parse-package-name')
const install = require('@poi/cli-utils/install-deps')
const logger = require('@poi/cli-utils/logger')

module.exports = class Generator {
  constructor(api) {
    this.api = api
  }

  getGeneratorsFromPlugins() {
    const generators = {}
    for (const plugin of this.api.plugins) {
      if (plugin.generators) {
        Object.assign(generators, plugin.generators)
      }
    }
    return generators
  }

  listGeneratorsFromPlugins() {
    const generators = this.getGeneratorsFromPlugins()
    const generatorNames = Object.keys(generators)
    if (generatorNames.length === 0) {
      return console.log(chalk.yellow(`No generators are available.`))
    }
    console.log(
      chalk.bold(
        'Showing all available generators you can invoke\nand how they might affect the file system:\n'
      )
    )
    console.log(
      generatorNames
        .map(name => {
          const { effects } = generators[name]
          let res = `${chalk.bold('-')} ${chalk.bold.green(name)}`
          if (effects) {
            res += chalk.dim(
              `\n${[]
                .concat(effects)
                .map(effect => {
                  return `  - ${effect}`
                })
                .join('\n')}`
            )
          }
          return res
        })
        .join('\n')
    )
  }

  async add(name, flags) {
    // @poi/foo => @poi/plugin-foo
    const parsed = parsePackageName(name)
    if (parsed.name.startsWith('@poi/')) {
      parsed.name = parsed.name.replace(/^@poi\/(plugin-)?/, '@poi/plugin-')
    } else {
      parsed.name = parsed.name.replace(/^(poi-plugin-)?/, 'poi-plugin-')
    }
    await install({
      deps: [`${parsed.name}${parsed.version ? `@${parsed.version}` : ''}`],
      saveDev: true,
      cwd: this.api.resolveBaseDir()
    })
    const { generators } = require(resolveFrom(
      this.api.resolveBaseDir(),
      parsed.name
    ))
    if (generators) {
      for (const name of Object.keys(generators)) {
        const generator = generators[name]
        if (generator.invokeOnAdd) {
          // eslint-disable-next-line no-await-in-loop
          await this.invoke(generator, flags)
        }
      }
    }
  }

  async invokeFromPlugins(name, flags) {
    const generators = this.getGeneratorsFromPlugins()

    if (!generators[name]) {
      return logger.error(`Generator "${name}" does not exist!`)
    }

    await this.invoke(generators[name], flags)
    if (flags.successMessage !== false) {
      console.log()
      logger.success(`Successfully invoked generator "${chalk.bold(name)}"!`)
    }
  }

  async invoke(generator, flags) {
    const questions = generator.prompts
    const answers = Object.assign({}, questions && (await prompt(questions)))
    const pkgPath =
      this.api.projectPkg.path || this.api.resolveBaseDir('package.json')
    const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'))
    const context = {
      answers,
      fs,
      pkg,
      projectName: pkg.name || path.basename(process.cwd()),
      resolveBaseDir: this.api.resolveBaseDir.bind(this.api),
      appendFile: async (filename, extra) => {
        const filepath = this.api.resolveBaseDir(filename)
        const content = await fs
          .pathExists(filepath)
          .then(exists => exists && fs.readFile(filepath, 'utf8'))
        if (content && content.includes(extra)) return true
        await fs.writeFile(filepath, content + extra, 'utf8')
      },
      writeFile: async (filename, content) => {
        const outPath = this.api.resolveBaseDir(filename)

        const exists = await fs.pathExists(outPath)
        if (exists) {
          const { overwrite } = await prompt({
            name: 'overwrite',
            type: 'confirm',
            message: `${path.relative(
              process.cwd(),
              outPath
            )} already exists, do you want to overwrite it`,
            default: false
          })
          if (!overwrite && !flags.overwrite) {
            logger.debug(chalk.yellow(`Skipped generating ${outPath}`))
            return false
          }
        }

        await fs.writeFile(outPath, content, 'utf8')
        return true
      },
      renderTemplate: async (templatePath, outName, data) => {
        const outPath = this.api.resolveBaseDir(outName)

        const exists = await fs.pathExists(outPath)
        if (exists) {
          const { overwrite } = await prompt({
            name: 'overwrite',
            type: 'confirm',
            message: `${path.relative(
              process.cwd(),
              outPath
            )} already exists, do you want to overwrite it`,
            default: false
          })
          if (!overwrite && !flags.overwrite) {
            this.api.logger.debug(chalk.yellow(`Skipped generating ${outPath}`))
            return false
          }
        }

        const content = await fs.readFile(templatePath, 'utf8')
        const template = compileTemplate(content)
        const output = template(Object.assign({ $pkg: pkg }, answers, data))
        this.api.logger.debug(chalk.green(`Generated ${outPath}`))
        await fs.ensureDir(path.dirname(outPath))
        await fs.writeFile(outPath, output, 'utf8')
        return true
      },
      updatePkg: fn => {
        // eslint-disable-next-line no-multi-assign
        const data = fn(pkg) || pkg
        return fs.writeFile(pkgPath, JSON.stringify(data, null, 2), 'utf8')
      },
      // installDeps: async (deps, saveDev) => {
      //   return install({
      //     cwd: this.api.resolveBaseDir(),
      //     deps,
      //     saveDev
      //   })
      // },
      npmInstall: () =>
        install({
          cwd: this.api.resolveBaseDir()
        })
    }
    await generator.generate(context)
  }
}