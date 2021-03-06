const { CommandStructures } = require('../../')
const { Command, CommandParameters, StringParameter } = CommandStructures
const cowsay = require('cowsay')

module.exports = class Cowsay extends Command {
  constructor (client) {
    super(client)
    this.name = 'cowsay'
    this.aliases = ['cs']

    this.parameters = new CommandParameters(this,
      new StringParameter({ full: true, clean: true, missingError: 'commands:cowsay.noText' })
    )
  }

  run ({ channel, message }, text) {
    channel.send(`\`\`\`${cowsay.say({ text })}\`\`\``)
  }
}
