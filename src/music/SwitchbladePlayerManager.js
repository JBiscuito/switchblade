const { GuildPlayer, Song, SongSearchResult, SongSource, Playlist } = require('./structures')
const {
  Songs: {
    HTTPSong, SoundcloudSong, TwitchSong, YoutubeSong, YoutubePlaylist
  },
  Sources
} = require('./sources')

const MusicUtils = require('./MusicUtils.js')

const { PlayerManager } = require('discord.js-lavalink')
const snekfetch = require('snekfetch')

const DEFAULT_JOIN_OPTIONS = { selfdeaf: true }

// Region resolver
const defaultRegions = {
  asia: [ 'sydney', 'singapore', 'japan', 'hongkong' ],
  eu: [ 'london', 'frankfurt', 'amsterdam', 'russia', 'eu-central', 'eu-west', 'southafrica' ],
  us: [ 'us-central', 'us-west', 'us-east', 'us-south' ],
  sam: [ 'brazil' ]
}
const resolveRegion = (region) => {
  region = region.replace('vip-', '')
  const dRegion = Object.entries(defaultRegions).find(([ , r ]) => r.includes(region))
  return dRegion && dRegion[0]
}

module.exports = class SwitchbladePlayerManager extends PlayerManager {
  constructor (client, nodes = [], options = {}) {
    options.player = GuildPlayer
    super(client, nodes, options)

    // TODO: Rest API based on guild's region (or maybe bot's location)
    this.REST_ADDRESS = `${nodes[0].host}:${nodes[0].port}`
    this.REST_PASSWORD = nodes[0].password
  }

  onMessage (message) {
    if (!message || !message.op) return
    const player = this.get(message.guildId)
    if (!player) return
    return player.event(message)
  }

  async fetchTracks (identifier) {
    const specialSource = Object.values(Sources).find(source => source.test(identifier))
    if (specialSource) return specialSource

    const res = await snekfetch.get(`http://${this.REST_ADDRESS}/loadtracks`)
      .query({ identifier })
      .set('Authorization', this.REST_PASSWORD)
      .catch(e => {
        this.client.logError(new Error(`Lavalink fetchTracks ${e}`))
      })

    const { body } = res
    if (!body || ['LOAD_FAILED', 'NO_MATCHES'].includes(body.loadType) || !body.tracks.length) return

    const songs = body.tracks
    songs.searchResult = body.loadType === 'SEARCH_RESULT'
    return songs
  }

  async loadTracks (identifier, requestedBy) {
    const songs = await this.fetchTracks(identifier)
    if (songs && Object.getPrototypeOf(songs) === SongSource) {
      return SongSearchResult.from(songs.provide(this, identifier, requestedBy), false)
    }

    if (songs && songs.length > 0) {
      const searchResult = new SongSearchResult(songs.searchResult)
      if (songs.searchResult || songs.length === 1) {
        const [ song ] = songs
        const source = song.info.source = MusicUtils.getSongSource(song)

        switch (source) {
          case 'http':
            return searchResult.setResult(new HTTPSong(song, requestedBy, this.client.apis.icecast).loadInfo())
          case 'youtube':
            return searchResult.setResult(new YoutubeSong(song, requestedBy, this.client.apis.youtube).loadInfo())
          case 'twitch':
            return searchResult.setResult(new TwitchSong(song, requestedBy, this.client.apis.twitch).loadInfo())
          case 'soundcloud':
            return searchResult.setResult(new SoundcloudSong(song, requestedBy, this.client.apis.soundcloud).loadInfo())
          default:
            return searchResult.setResult(new Song(songs[0], requestedBy).loadInfo())
        }
      } else {
        const pInfo = MusicUtils.getPlaylistInfo(identifier)
        switch (pInfo.source) {
          case 'youtube':
            return searchResult.setResult(new YoutubePlaylist(pInfo, songs, requestedBy, this.client.apis.youtube).loadInfo())
          default:
            return searchResult.setResult(new Playlist(pInfo, songs, requestedBy).loadInfo())
        }
      }
    }
    return new SongSearchResult(true)
  }

  async play (song, channel) {
    if (song && song instanceof Song) {
      const host = this.getIdealHost(channel.guild.region)
      const player = this.join({
        guild: channel.guild.id,
        channel: channel.id,
        host
      }, DEFAULT_JOIN_OPTIONS)
      player.play(song)
      return song
    }
    return null
  }

  getIdealHost (region) {
    region = resolveRegion(region)
    const { host } = (region && this.nodes.find(n => n.ready && n.region === region)) || this.nodes.first()
    return host
  }
}
