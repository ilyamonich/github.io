(function() {
  'use strict';

  var kinogo_token = Lampa.Storage.get('kinogo_token', '');
  var unic_id = Lampa.Storage.get('kinogo_uid', '');
  if (!unic_id) {
    unic_id = Lampa.Utils.uid(16);
    Lampa.Storage.set('kinogo_uid', unic_id);
  }
  
  var proxy_url = 'http://cors.cfhttp.top/';
  var api_url = 'https://kinogo.ec/';
  var dev_token = 'user_dev_apk=2.0.1&user_dev_id=' + unic_id + '&user_dev_name=Lampa&user_dev_os=11&user_dev_vendor=KINOGO&user_dev_token=';
  var modalopen = false;
  var ping_auth;

  function kinogo(component, _object) {
    var network = new Lampa.Reguest();
    var extract = {};
    var results = [];
    var object = _object;
    var wait_similars;
    var filter_items = {};
    var choice = {
      season: 0,
      voice: 0,
      voice_name: ''
    };

    // Парсинг HTML страницы Kinogo
    function parseKinogoPage(html) {
      var results = {
        player_links: {
          playlist: {},
          movie: []
        },
        last_episode: {}
      };

      try {
        // Парсим сериалы
        var seasonBlocks = html.match(/<div class="serial-series[^>]*>[\s\S]*?<\/div><\/div><\/div>/g);
        if (seasonBlocks) {
          seasonBlocks.forEach(function(seasonBlock, seasonIndex) {
            var seasonNum = seasonIndex + 1;
            results.player_links.playlist[seasonNum] = {};
            
            // Парсим переводы
            var voiceBlocks = seasonBlock.match(/<div class="serial-translation[^>]*>[\s\S]*?<\/ul><\/div>/g);
            if (voiceBlocks) {
              voiceBlocks.forEach(function(voiceBlock, voiceIndex) {
                var voiceMatch = voiceBlock.match(/<div class="serial-translation__title">([^<]*)</);
                var voiceName = voiceMatch ? voiceMatch[1].trim() : 'Перевод ' + (voiceIndex + 1);
                
                results.player_links.playlist[seasonNum][voiceName] = {};
                
                // Парсим эпизоды
                var episodeLinks = voiceBlock.match(/<a href="([^"]*)"[^>]*class="serial-series__link[^>]*>[\s\S]*?<\/a>/g);
                if (episodeLinks) {
                  episodeLinks.forEach(function(episodeLink, episodeIndex) {
                    var urlMatch = episodeLink.match(/href="([^"]*)"/);
                    var numMatch = episodeLink.match(/<span class="serial-series__num">([^<]*)</);
                    
                    if (urlMatch && numMatch) {
                      var episodeNum = parseInt(numMatch[1]) || (episodeIndex + 1);
                      results.player_links.playlist[seasonNum][voiceName][episodeNum] = {
                        link: api_url + urlMatch[1].replace(/^\//, ''),
                        qualities: [360, 480, 720, 1080]
                      };
                    }
                  });
                }
              });
            }
          });
        }

        // Парсим фильмы
        var moviePlayers = html.match(/<iframe[^>]*data-src="([^"]*)"[^>]*>/g);
        if (moviePlayers && !seasonBlocks) {
          moviePlayers.forEach(function(player, index) {
            var srcMatch = player.match(/data-src="([^"]*)"/);
            if (srcMatch) {
              results.player_links.movie.push({
                link: srcMatch[1],
                translation: 'Основной перевод',
                qualities: [360, 480, 720, 1080]
              });
            }
          });
        }

        // Определяем последний эпизод для сериалов
        if (seasonBlocks && seasonBlocks.length > 0) {
          var lastSeason = seasonBlocks.length;
          var lastEpisode = 0;
          for (var episode in results.player_links.playlist[lastSeason]) {
            var episodes = Object.keys(results.player_links.playlist[lastSeason][episode]);
            var maxEpisode = Math.max.apply(null, episodes);
            lastEpisode = Math.max(lastEpisode, maxEpisode);
          }
          results.last_episode = {
            season: lastSeason,
            episode: lastEpisode
          };
        }

      } catch (e) {
        console.error('Error parsing Kinogo page:', e);
      }

      return results;
    }

    // Получение прямых ссылок на видео
    function getVideoLinks(url) {
      return new Promise(function(resolve) {
        network.silent(proxy_url + url, function(html) {
          var links = [];
          
          // Парсим различные источники видео
          var videoMatches = html.match(/(https?:[^"']*\.(mp4|m3u8)[^"']*)/g);
          if (videoMatches) {
            videoMatches.forEach(function(link) {
              if (link.includes('video') || link.includes('cdn')) {
                links.push({
                  url: link,
                  quality: 720 // По умолчанию
                });
              }
            });
          }
          
          // Если не нашли прямых ссылок, используем URL как есть
          if (links.length === 0) {
            links.push({
              url: url,
              quality: 720
            });
          }
          
          resolve(links);
        }, function() {
          resolve([{url: url, quality: 720}]);
        });
      });
    }

    this.search = function(_object, sim) {
      if (wait_similars) this.find(sim[0].id);
    };

    function normalizeString(str) {
      return str.toLowerCase().replace(/[^a-zа-я0-9]/g, '');
    }

    this.searchByTitle = function(_object, query) {
      var _this = this;
      object = _object;
      
      var year = parseInt((object.movie.release_date || object.movie.first_air_date || '0000').slice(0, 4));
      var orig = object.movie.original_name || object.movie.original_title;
      var title = object.movie.title || object.movie.name;
      
      // Формируем URL для поиска на Kinogo
      var searchQuery = encodeURIComponent(title + ' ' + year);
      var searchUrl = api_url + 'index.php?do=search&subaction=search&story=' + searchQuery;
      
      network.clear();
      network.silent(proxy_url + searchUrl, function(html) {
        // Парсим результаты поиска
        var results = [];
        var itemMatches = html.match(/<div class="shortstory[^>]*>[\s\S]*?<\/div><\/div><\/div>/g);
        
        if (itemMatches) {
          itemMatches.forEach(function(item) {
            var titleMatch = item.match(/<h2><a href="([^"]*)">([^<]*)</);
            var yearMatch = item.match(/(19|20)\d{2}/);
            
            if (titleMatch) {
              var itemYear = yearMatch ? parseInt(yearMatch[0]) : year;
              var itemTitle = titleMatch[2];
              
              // Проверяем соответствие году и названию
              if (itemYear >= year - 2 && itemYear <= year + 2) {
                results.push({
                  id: titleMatch[1],
                  title: itemTitle,
                  year: itemYear,
                  url: api_url + titleMatch[1].replace(/^\//, '')
                });
              }
            }
          });
        }
        
        // Ищем наиболее подходящий результат
        var exactMatch = results.find(function(item) {
          return normalizeString(item.title) === normalizeString(title) && 
                 Math.abs(item.year - year) <= 1;
        });
        
        if (exactMatch) {
          _this.find(exactMatch.url);
        } else if (results.length > 0) {
          // Берем первый результат
          _this.find(results[0].url);
        } else {
          component.doesNotAnswer();
        }
        
      }, function(a, c) {
        component.doesNotAnswer();
      });
    };

    this.find = function(kinogo_url) {
      network.clear();
      network.timeout(15000);
      
      network.silent(proxy_url + kinogo_url, function(html) {
        if (html && html.length > 1000) { // Проверяем что получили нормальную страницу
          var parsedData = parseKinogoPage(html);
          if (Object.keys(parsedData.player_links.playlist).length > 0 || 
              parsedData.player_links.movie.length > 0) {
            success(parsedData);
            component.loading(false);
          } else {
            component.doesNotAnswer();
          }
        } else {
          component.doesNotAnswer();
        }
      }, function(a, c) {
        component.doesNotAnswer();
      });
    };

    this.extendChoice = function(saved) {
      Lampa.Arrays.extend(choice, saved, true);
    };

    this.reset = function() {
      component.reset();
      choice = {
        season: 0,
        voice: 0,
        voice_name: ''
      };
      extractData(results);
      filter();
      append(filtred());
    };

    this.filter = function(type, a, b) {
      choice[a.stype] = b.index;
      if (a.stype == 'voice') choice.voice_name = filter_items.voice[b.index];
      component.reset();
      extractData(results);
      filter();
      append(filtred());
    };

    this.destroy = function() {
      network.clear();
      results = null;
    };

    function success(json) {
      results = json;
      extractData(json);
      filter();
      append(filtred());
    }

    function extractData(data) {
      extract = {};
      
      // Обработка сериалов
      if (data.player_links.playlist && Object.keys(data.player_links.playlist).length > 0) {
        var transl_id = 0;
        
        for (var season in data.player_links.playlist) {
          var seasonData = data.player_links.playlist[season];
          
          for (var voice in seasonData) {
            transl_id++;
            var episodesData = seasonData[voice];
            
            if (!extract[transl_id]) {
              extract[transl_id] = {
                json: [],
                file: '',
                voice: voice
              };
            }
            
            var seasonEpisodes = [];
            for (var episodeNum in episodesData) {
              var episodeData = episodesData[episodeNum];
              
              seasonEpisodes.push({
                id: season + '_' + episodeNum,
                comment: episodeNum + ' ' + Lampa.Lang.translate('torrent_serial_episode'),
                file: episodeData.link,
                episode: parseInt(episodeNum),
                season: parseInt(season),
                quality: 720,
                qualities: episodeData.qualities,
                translation: transl_id
              });
            }
            
            extract[transl_id].json.push({
              id: parseInt(season),
              comment: season + ' ' + Lampa.Lang.translate('torrent_serial_season'),
              folder: seasonEpisodes,
              translation: transl_id
            });
          }
        }
      } 
      // Обработка фильмов
      else if (data.player_links.movie && data.player_links.movie.length > 0) {
        data.player_links.movie.forEach(function(movie, index) {
          extract[index + 1] = {
            file: movie.link,
            translation: movie.translation,
            quality: 720,
            qualities: movie.qualities,
            voice: movie.translation
          };
        });
      }
    }

    function getFile(element, max_quality) {
      var translat = extract[element.translation];
      var file = '';
      var quality = false;

      if (translat) {
        if (element.season) {
          // Для сериалов
          for (var i in translat.json) {
            var seasonData = translat.json[i];
            if (seasonData.id == element.season && seasonData.folder) {
              for (var j in seasonData.folder) {
                var episodeData = seasonData.folder[j];
                if (episodeData.episode == element.episode && episodeData.season == element.season) {
                  file = episodeData.file;
                  break;
                }
              }
            }
          }
        } else {
          // Для фильмов
          file = translat.file;
        }
      }

      // Генерация вариантов качества
      if (file) {
        quality = {};
        var qualities = [360, 480, 720, 1080];
        qualities.forEach(function(q) {
          if (q <= window.kinogo.max_qualitie) {
            quality[q + 'p'] = file; // Kinogo обычно сам определяет качество
          }
        });
        
        var preferably = Lampa.Storage.get('video_quality_default', '1080') + 'p';
        if (quality[preferably]) file = quality[preferably];
      }

      return {
        file: file,
        quality: quality
      };
    }

    function filter() {
      filter_items = {
        season: [],
        voice: [],
        voice_info: []
      };

      // Для сериалов
      if (results.last_episode && results.last_episode.season) {
        for (var s = 1; s <= results.last_episode.season; s++) {
          filter_items.season.push(Lampa.Lang.translate('torrent_serial_season') + ' ' + s);
        }
      }

      // Собираем все доступные переводы
      var voices = new Set();
      for (var transl_id in extract) {
        if (extract[transl_id].voice) {
          voices.add(extract[transl_id].voice);
        }
      }
      
      filter_items.voice = Array.from(voices);
      filter_items.voice_info = filter_items.voice.map(function(voice, index) {
        return { id: index + 1 };
      });

      if (choice.voice_name) {
        var inx = filter_items.voice.map(function(v) {
          return v.toLowerCase();
        }).indexOf(choice.voice_name.toLowerCase());
        if (inx == -1) choice.voice = 0;
        else if (inx !== choice.voice) {
          choice.voice = inx;
        }
      }

      component.filter(filter_items, choice);
    }

    function filtred() {
      var filtred = [];

      if (Object.keys(results.player_links.playlist).length) {
        // Для сериалов
        for (var transl_id in extract) {
          var element = extract[transl_id];
          
          for (var season_id in element.json) {
            var season = element.json[season_id];
            
            if (season.id == choice.season + 1) {
              season.folder.forEach(function(media) {
                if (element.voice === filter_items.voice[choice.voice]) {
                  filtred.push({
                    episode: media.episode,
                    season: media.season,
                    title: Lampa.Lang.translate('torrent_serial_episode') + ' ' + media.episode,
                    quality: media.quality + 'p',
                    translation: parseInt(transl_id),
                    voice_name: element.voice,
                    info: element.voice
                  });
                }
              });
            }
          }
        }
      } else {
        // Для фильмов
        for (var movie_id in extract) {
          var movie = extract[movie_id];
          filtred.push({
            title: movie.translation,
            quality: movie.quality + 'p',
            qualitys: movie.qualities,
            translation: parseInt(movie_id),
            voice_name: movie.voice
          });
        }
      }

      return filtred;
    }

    function toPlayElement(element) {
      var extra = getFile(element, element.quality);
      var play = {
        title: element.title,
        url: extra.file,
        quality: extra.quality,
        timeline: element.timeline,
        callback: element.mark
      };
      return play;
    }

    function append(items) {
      component.reset();
      component.draw(items, {
        similars: wait_similars,
        onEnter: function onEnter(item, html) {
          var extra = getFile(item, item.quality);

          if (extra.file) {
            // Получаем прямые ссылки на видео
            getVideoLinks(extra.file).then(function(videoLinks) {
              if (videoLinks.length > 0) {
                var playlist = [];
                var first = toPlayElement(item);
                first.url = videoLinks[0].url; // Используем первую найденную ссылку

                if (item.season) {
                  // Для сериалов создаем плейлист
                  items.forEach(function(elem) {
                    var playItem = toPlayElement(elem);
                    playlist.push(playItem);
                  });
                } else {
                  playlist.push(first);
                }

                if (playlist.length > 1) first.playlist = playlist;
                Lampa.Player.play(first);
                Lampa.Player.playlist(playlist);
                item.mark();
              } else {
                Lampa.Noty.show(Lampa.Lang.translate('online_nolink'));
              }
            });
          } else {
            Lampa.Noty.show(Lampa.Lang.translate('online_nolink'));
          }
        },
        onContextMenu: function onContextMenu(item, html, data, call) {
          call(getFile(item, item.quality));
        }
      });
    }
  }

  function component(object) {
    var network = new Lampa.Reguest();
    var scroll = new Lampa.Scroll({
      mask: true,
      over: true
    });
    var files = new Lampa.Explorer(object);
    var filter = new Lampa.Filter(object);
    var sources = {
      kinogo: kinogo
    };
    var last;
    var extended;
    var selected_id;
    var source;
    var balanser = 'kinogo';
    var initialized;
    var balanser_timer;
    var images = [];
    var filter_translate = {
      season: Lampa.Lang.translate('torrent_serial_season'),
      voice: Lampa.Lang.translate('torrent_parser_voice'),
      source: Lampa.Lang.translate('settings_rest_source')
    };

    this.initialize = function() {
      var _this = this;

      source = this.createSource();

      filter.onSearch = function(value) {
        Lampa.Activity.replace({
          search: value,
          clarification: true
        });
      };

      filter.onBack = function() {
        _this.start();
      };

      filter.render().find('.selector').on('hover:enter', function() {
        clearInterval(balanser_timer);
      });

      filter.onSelect = function(type, a, b) {
        if (type == 'filter') {
          if (a.reset) {
            if (extended) source.reset();
            else _this.start();
          } else {
            source.filter(type, a, b);
          }
        } else if (type == 'sort') {
          Lampa.Select.close();
        }
      };

      if (filter.addButtonBack) filter.addButtonBack();
      filter.render().find('.filter--sort').remove();
      files.appendFiles(scroll.render());
      files.appendHead(filter.render());
      scroll.body().addClass('torrent-list');
      scroll.minus(files.render().find('.explorer__files-head'));
      this.search();
    };

    this.createSource = function() {
      return new sources[balanser](this, object);
    };

    this.create = function() {
      return this.render();
    };

    this.search = function() {
      this.activity.loader(true);
      this.find();
    };

    this.find = function() {
      if (source.searchByTitle) {
        this.extendChoice();
        source.searchByTitle(object, object.search || object.movie.original_title || object.movie.original_name || object.movie.title || object.movie.name);
      }
    };

    this.getChoice = function(for_balanser) {
      var data = Lampa.Storage.cache('online_choice_' + (for_balanser || balanser), 3000, {});
      var save = data[selected_id || object.movie.id] || {};
      Lampa.Arrays.extend(save, {
        season: 0,
        voice: 0,
        voice_name: '',
        voice_id: 0,
        episodes_view: {},
        movie_view: ''
      });
      return save;
    };

    this.extendChoice = function() {
      extended = true;
      source.extendChoice(this.getChoice());
    };

    this.saveChoice = function(choice, for_balanser) {
      var data = Lampa.Storage.cache('online_choice_' + (for_balanser || balanser), 3000, {});
      data[selected_id || object.movie.id] = choice;
      Lampa.Storage.set('online_choice_' + (for_balanser || balanser), data);
    };

    this.similars = function(json) {
      var _this3 = this;

      json.forEach(function(elem) {
        var info = [];
        var year = ((elem.start_date || elem.year || '') + '').slice(0, 4);
        if (elem.rating && elem.rating !== 'null' && elem.filmId) info.push(Lampa.Template.get('online_prestige_rate', {
          rate: elem.rating
        }, true));
        if (year) info.push(year);

        if (elem.countries && elem.countries.length) {
          info.push((elem.filmId ? elem.countries.map(function(c) {
            return c.country;
          }) : elem.countries).join(', '));
        }

        if (elem.categories && elem.categories.length) {
          info.push(elem.categories.slice(0, 4).join(', '));
        }

        var name = elem.title || elem.ru_title || elem.en_title || elem.nameRu || elem.nameEn;
        var orig = elem.orig_title || elem.nameEn || '';
        elem.title = name + (orig && orig !== name ? ' / ' + orig : '');
        elem.time = elem.filmLength || '';
        elem.info = info.join('<span class="online-prestige-split">●</span>');
        var item = Lampa.Template.get('online_prestige_folder', elem);
        item.on('hover:enter', function() {
          _this3.activity.loader(true);

          _this3.reset();

          object.search_date = year;
          selected_id = elem.id;

          _this3.extendChoice();

          if (source.search) {
            source.search(object, [elem]);
          } else {
            _this3.doesNotAnswer();
          }
        }).on('hover:focus', function(e) {
          last = e.target;
          scroll.update($(e.target), true);
        });
        scroll.append(item);
      });
    };

    this.clearImages = function() {
      images.forEach(function(img) {
        img.onerror = function() {};
        img.onload = function() {};
        img.src = '';
      });
      images = [];
    };

    this.reset = function() {
      last = false;
      clearInterval(balanser_timer);
      network.clear();
      this.clearImages();
      scroll.render().find('.empty').remove();
      scroll.clear();
    };

    this.loading = function(status) {
      if (status) this.activity.loader(true);
      else {
        this.activity.loader(false);
        this.activity.toggle();
      }
    };

    this.filter = function(filter_items, choice) {
      var _this4 = this;

      var select = [];

      var add = function add(type, title) {
        var need = _this4.getChoice();

        var items = filter_items[type];
        var subitems = [];
        var value = need[type];
        items.forEach(function(name, i) {
          subitems.push({
            title: name,
            selected: value == i,
            index: i
          });
        });
        select.push({
          title: title,
          subtitle: items[value],
          items: subitems,
          stype: type
        });
      };

      select.push({
        title: Lampa.Lang.translate('torrent_parser_reset'),
        reset: true
      });
      this.saveChoice(choice);
      if (filter_items.voice && filter_items.voice.length) add('voice', Lampa.Lang.translate('torrent_parser_voice'));
      if (filter_items.season && filter_items.season.length) add('season', Lampa.Lang.translate('torrent_serial_season'));
      filter.set('filter', select);
      this.selected(filter_items);
    };

    this.closeFilter = function() {
      if ($('body').hasClass('selectbox--open')) Lampa.Select.close();
    };

    this.selected = function(filter_items) {
      var need = this.getChoice(),
        select = [];

      for (var i in need) {
        if (filter_items[i] && filter_items[i].length) {
          if (i == 'voice') {
            select.push(filter_translate[i] + ': ' + filter_items[i][need[i]]);
          } else if (i !== 'source') {
            if (filter_items.season.length >= 1) {
              select.push(filter_translate.season + ': ' + filter_items[i][need[i]]);
            }
          }
        }
      }

      filter.chosen('filter', select);
      filter.chosen('sort', [balanser]);
    };

    this.getEpisodes = function(season, call) {
      var episodes = [];

      if (typeof object.movie.id == 'number' && object.movie.name) {
        var tmdburl = 'tv/' + object.movie.id + '/season/' + season + '?api_key=' + Lampa.TMDB.key() + '&language=' + Lampa.Storage.get('language', 'ru');
        var baseurl = Lampa.TMDB.api(tmdburl);
        network.timeout(1000 * 10);
        network["native"](baseurl, function(data) {
          episodes = data.episodes || [];
          call(episodes);
        }, function(a, c) {
          call(episodes);
        });
      } else call(episodes);
    };

    this.append = function(item) {
      item.on('hover:focus', function(e) {
        last = e.target;
        scroll.update($(e.target), true);
      });
      scroll.append(item);
    };

    this.watched = function(set) {
      var file_id = Lampa.Utils.hash(object.movie.number_of_seasons ? object.movie.original_name : object.movie.original_title);
      var watched = Lampa.Storage.cache('online_watched_last', 5000, {});

      if (set) {
        if (!watched[file_id]) watched[file_id] = {};
        Lampa.Arrays.extend(watched[file_id], set, true);
        Lampa.Storage.set('online_watched_last', watched);
      } else {
        return watched[file_id];
      }
    };

    this.draw = function(items) {
      var _this5 = this;

      var params = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
      if (!items.length) return this.empty();
      this.getEpisodes(items[0].season, function(episodes) {
        var viewed = Lampa.Storage.cache('online_view', 5000, []);
        var serial = object.movie.name ? true : false;

        var choice = _this5.getChoice();

        var fully = window.innerWidth > 480;
        var scroll_to_element = false;
        var scroll_to_mark = false;
        items.forEach(function(element, index) {
          var episode = serial && episodes.length && !params.similars ? episodes.find(function(e) {
            return e.episode_number == element.episode;
          }) : false;
          var episode_num = element.episode || index + 1;
          var episode_last = choice.episodes_view[element.season];
          Lampa.Arrays.extend(element, {
            info: '',
            quality: '',
            time: Lampa.Utils.secondsToTime((episode ? episode.runtime : object.movie.runtime) * 60, true)
          });
          var hash_timeline = Lampa.Utils.hash(element.season ? [element.season, element.episode, object.movie.original_title].join('') : object.movie.original_title);
          var hash_behold = Lampa.Utils.hash(element.season ? [element.season, element.episode, object.movie.original_title, element.voice_name].join('') : object.movie.original_title + element.voice_name);
          var data = {
            hash_timeline: hash_timeline,
            hash_behold: hash_behold
          };
          var info = [];

          if (element.season) {
            element.translate_episode_end = _this5.getLastEpisode(items);
            element.translate_voice = element.voice_name;
          }

          element.timeline = Lampa.Timeline.view(hash_timeline);

          if (episode) {
            element.title = episode.name;
            if (element.info.length < 30 && episode.vote_average) info.push(Lampa.Template.get('online_prestige_rate', {
              rate: parseFloat(episode.vote_average + '').toFixed(1)
            }, true));
            if (episode.air_date && fully) info.push(Lampa.Utils.parseTime(episode.air_date).full);
          } else if (object.movie.release_date && fully) {
            info.push(Lampa.Utils.parseTime(object.movie.release_date).full);
          }

          if (!serial && object.movie.tagline && element.info.length < 30) info.push(object.movie.tagline);
          if (element.info) info.push(element.info);
          if (info.length) element.info = info.map(function(i) {
            return '<span>' + i + '</span>';
          }).join('<span class="online-prestige-split">●</span>');
          var html = Lampa.Template.get('online_prestige_full', element);
          var loader = html.find('.online-prestige__loader');
          var image = html.find('.online-prestige__img');

          if (!serial) {
            if (choice.movie_view == hash_behold) scroll_to_element = html;
          } else if (typeof episode_last !== 'undefined' && episode_last == episode_num) {
            scroll_to_element = html;
          }

          if (serial && !episode) {
            image.append('<div class="online-prestige__episode-number">' + ('0' + (element.episode || index + 1)).slice(-2) + '</div>');
            loader.remove();
          } else {
            var img = html.find('img')[0];

            img.onerror = function() {
              img.src = './img/img_broken.svg';
            };

            img.onload = function() {
              image.addClass('online-prestige__img--loaded');
              loader.remove();
              if (serial) image.append('<div class="online-prestige__episode-number">' + ('0' + (element.episode || index + 1)).slice(-2) + '</div>');
            };

            img.src = Lampa.TMDB.image('t/p/w300' + (episode ? episode.still_path : object.movie.backdrop_path));
            images.push(img);
          }

          html.find('.online-prestige__timeline').append(Lampa.Timeline.render(element.timeline));

          if (viewed.indexOf(hash_behold) !== -1) {
            scroll_to_mark = html;
            html.find('.online-prestige__img').append('<div class="online-prestige__viewed">' + Lampa.Template.get('icon_viewed', {}, true) + '</div>');
          }

          element.mark = function() {
            viewed = Lampa.Storage.cache('online_view', 5000, []);

            if (viewed.indexOf(hash_behold) == -1) {
              viewed.push(hash_behold);
              Lampa.Storage.set('online_view', viewed);

              if (html.find('.online-prestige__viewed').length == 0) {
                html.find('.online-prestige__img').append('<div class="online-prestige__viewed">' + Lampa.Template.get('icon_viewed', {}, true) + '</div>');
              }
            }

            choice = _this5.getChoice();

            if (!serial) {
              choice.movie_view = hash_behold;
            } else {
              choice.episodes_view[element.season] = episode_num;
            }

            _this5.saveChoice(choice);

            _this5.watched({
              balanser: balanser,
              balanser_name: Lampa.Utils.capitalizeFirstLetter(balanser),
              voice_id: choice.voice_id,
              voice_name: choice.voice_name || element.voice_name,
              episode: element.episode,
              season: element.season
            });
          };

          element.unmark = function() {
            viewed = Lampa.Storage.cache('online_view', 5000, []);

            if (viewed.indexOf(hash_behold) !== -1) {
              Lampa.Arrays.remove(viewed, hash_behold);
              Lampa.Storage.set('online_view', viewed);
              if (Lampa.Manifest.app_digital >= 177) Lampa.Storage.remove('online_view', hash_behold);
              html.find('.online-prestige__viewed').remove();
            }
          };

          element.timeclear = function() {
            element.timeline.percent = 0;
            element.timeline.time = 0;
            element.timeline.duration = 0;
            Lampa.Timeline.update(element.timeline);
          };

          html.on('hover:enter', function() {
            if (object.movie.id) Lampa.Favorite.add('history', object.movie, 100);
            if (params.onEnter) params.onEnter(element, html, data);
          }).on('hover:focus', function(e) {
            last = e.target;
            if (params.onFocus) params.onFocus(element, html, data);
            scroll.update($(e.target), true);
          });
          if (params.onRender) params.onRender(element, html, data);

          _this5.contextMenu({
            html: html,
            element: element,
            onFile: function onFile(call) {
              if (params.onContextMenu) params.onContextMenu(element, html, data, call);
            },
            onClearAllMark: function onClearAllMark() {
              items.forEach(function(elem) {
                elem.unmark();
              });
            },
            onClearAllTime: function onClearAllTime() {
              items.forEach(function(elem) {
                elem.timeclear();
              });
            }
          });

          scroll.append(html);
        });

        if (serial && episodes.length > items.length && !params.similars) {
          var left = episodes.slice(items.length);
          left.forEach(function(episode) {
            var info = [];
            if (episode.vote_average) info.push(Lampa.Template.get('online_prestige_rate', {
              rate: parseFloat(episode.vote_average + '').toFixed(1)
            }, true));
            if (episode.air_date) info.push(Lampa.Utils.parseTime(episode.air_date).full);
            var air = new Date((episode.air_date + '').replace(/-/g, '/'));
            var now = Date.now();
            var day = Math.round((air.getTime() - now) / (24 * 60 * 60 * 1000));
            var txt = Lampa.Lang.translate('full_episode_days_left') + ': ' + day;
            var html = Lampa.Template.get('online_prestige_full', {
              time: Lampa.Utils.secondsToTime((episode ? episode.runtime : object.movie.runtime) * 60, true),
              info: info.length ? info.map(function(i) {
                return '<span>' + i + '</span>';
              }).join('<span class="online-prestige-split">●</span>') : '',
              title: episode.name,
              quality: day > 0 ? txt : ''
            });
            var loader = html.find('.online-prestige__loader');
            var image = html.find('.online-prestige__img');
            var season = items[0] ? items[0].season : 1;
            html.find('.online-prestige__timeline').append(Lampa.Timeline.render(Lampa.Timeline.view(Lampa.Utils.hash([season, episode.episode_number, object.movie.original_title].join('')))));
            var img = html.find('img')[0];

            if (episode.still_path)
