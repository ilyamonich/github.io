(function() {
  'use strict';

  var rezka_token = Lampa.Storage.get('rezka_token', '');
  var unic_id = Lampa.Storage.get('rezka_uid', '');
  if (!unic_id) {
    unic_id = Lampa.Utils.uid(16);
    Lampa.Storage.set('rezka_uid', unic_id);
  }
  
  var proxy_url = 'https://corsproxy.io/?';
  var api_url = 'https://rezka.ag/';
  var dev_token = 'user_dev_id=' + unic_id + '&user_dev_name=Lampa&user_dev_os=11&user_dev_vendor=RezkaAPI';
  var modalopen = false;

  function rezkaapi(component, _object) {
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

    // Функция для парсинга страницы Rezka
    function parseRezkaPage(html) {
      var data = {
        translations: [],
        seasons: [],
        episodes: [],
        is_series: false,
        title: ''
      };

      try {
        // Получение названия
        var titleMatch = html.match(/<title>([^<]+)<\/title>/);
        if (titleMatch) data.title = titleMatch[1].replace(/&#.*?;/g, '').trim();

        // Определение типа контента (сериал или фильм)
        data.is_series = html.indexOf('сезон') !== -1 || html.indexOf('series') !== -1;

        // Парсинг переводов (озвучек)
        var translatorsRegex = /<li class="b-translators__item[^>]*data-translator_id="(\d+)"[^>]*>[\s\S]*?<span class="b-translators__item-name">([^<]+)<\/span>/g;
        var translationMatch;
        while ((translationMatch = translatorsRegex.exec(html)) !== null) {
          data.translations.push({
            id: translationMatch[1],
            name: translationMatch[2].trim()
          });
        }

        // Если переводы не найдены, добавляем стандартный
        if (data.translations.length === 0) {
          data.translations.push({
            id: '1',
            name: 'Оригинал'
          });
        }

        // Парсинг сезонов (для сериалов)
        if (data.is_series) {
          var seasonsRegex = /<li class="b-simple_season__item[^>]*data-tab_id="(\d+)"[^>]*data-season_id="(\d+)"[^>]*>[\s\S]*?<span class="b-simple_season__item-title">([^<]+)<\/span>/g;
          var seasonMatch;
          while ((seasonMatch = seasonsRegex.exec(html)) !== null) {
            data.seasons.push({
              id: seasonMatch[2],
              name: seasonMatch[3].trim()
            });
          }
        } else {
          // Для фильмов - один "сезон"
          data.seasons.push({
            id: '1',
            name: 'Фильм'
          });
        }

        // Парсинг эпизодов или фильма
        if (data.is_series) {
          var episodesRegex = /<li class="b-simple_episode__item[^>]*data-episode_id="(\d+)"[^>]*data-episode_url="([^"]*)"[^>]*>[\s\S]*?<span class="b-simple_episode__item-title">([^<]+)<\/span>/g;
          var episodeMatch;
          while ((episodeMatch = episodesRegex.exec(html)) !== null) {
            data.episodes.push({
              id: episodeMatch[1],
              url: episodeMatch[2],
              name: episodeMatch[3].trim()
            });
          }
        } else {
          // Для фильма - один "эпизод" с основной страницы
          var filmUrlMatch = html.match(/<a href="([^"]*)"[^>]*class="b-content__inline_item-link[^"]*"/);
          if (filmUrlMatch) {
            data.episodes.push({
              id: '1',
              url: filmUrlMatch[1],
              name: 'Просмотр'
            });
          }
        }

      } catch (e) {
        console.error('Error parsing Rezka page:', e);
      }

      return data;
    }

    // Функция для получения видео URL
    function getVideoUrl(episodeUrl, translationId) {
      return new Promise(function(resolve, reject) {
        var url = proxy_url + encodeURIComponent(episodeUrl);
        
        network.silent(url, function(html) {
          try {
            // Поиск видео URL в различных форматах
            var videoUrl = null;
            
            // Попытка 1: Поиск в JSON данных
            var jsonMatch = html.match(/video\[0\]\s*=\s*({[^;]+});/);
            if (jsonMatch) {
              try {
                var videoData = JSON.parse(jsonMatch[1]);
                if (videoData.url) {
                  videoUrl = videoData.url;
                }
              } catch (e) {}
            }
            
            // Попытка 2: Поиск в прямом URL
            if (!videoUrl) {
              var directMatch = html.match(/(https?:\/\/[^\s"']+\.(mp4|m3u8)[^\s"']*)/i);
              if (directMatch) {
                videoUrl = directMatch[1];
              }
            }
            
            // Попытка 3: Поиск в file параметре
            if (!videoUrl) {
              var fileMatch = html.match(/file["']?:\s*["']([^"']+)["']/);
              if (fileMatch) {
                videoUrl = fileMatch[1];
              }
            }

            if (videoUrl) {
              // Обработка URL
              if (videoUrl.startsWith('//')) {
                videoUrl = 'https:' + videoUrl;
              }
              resolve(videoUrl);
            } else {
              reject('Video URL not found on page');
            }
          } catch (e) {
            reject('Error parsing video page: ' + e);
          }
        }, function(a, c) {
          reject('Network error: ' + c);
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
      
      // Поиск на Rezka.ag
      var searchUrl = proxy_url + encodeURIComponent(api_url + 'search/?do=search&subaction=search&q=' + encodeURIComponent(query));
      
      network.clear();
      network.timeout(10000);
      network.silent(searchUrl, function(html) {
        try {
          var results = [];
          
          // Парсинг результатов поиска
          var searchRegex = /<div class="b-content__inline_item[^>]*>[\s\S]*?<a href="([^"]*)"[^>]*title="([^"]*)"[^>]*>[\s\S]*?<div class="b-content__inline_item-year">([^<]*)<\/div>/g;
          var searchMatch;
          
          while ((searchMatch = searchRegex.exec(html)) !== null) {
            var itemUrl = searchMatch[1];
            var itemTitle = searchMatch[2].replace(/&#.*?;/g, '').trim();
            var itemYear = parseInt(searchMatch[3]) || 0;
            
            if (itemYear >= year - 2 && itemYear <= year + 2) {
              results.push({
                url: itemUrl,
                title: itemTitle,
                year: itemYear,
                id: itemUrl.split('/').pop().replace('.html', '')
              });
            }
          }

          // Поиск наиболее подходящего результата
          var bestMatch = results.find(function(item) {
            var normalizedItem = normalizeString(item.title);
            var normalizedOrig = normalizeString(orig);
            return item.year == year && normalizedItem.includes(normalizedOrig);
          });

          if (!bestMatch && results.length > 0) {
            // Выбираем первый результат если точного совпадения нет
            bestMatch = results[0];
          }
          
          if (bestMatch) {
            _this.find(bestMatch.id, bestMatch.url);
          } else if (results.length) {
            wait_similars = true;
            component.similars(results);
            component.loading(false);
          } else {
            component.doesNotAnswer();
          }

        } catch (e) {
          console.error('Search error:', e);
          component.doesNotAnswer();
        }
      }, function(a, c) {
        console.error('Network search error:', c);
        component.doesNotAnswer();
      });
    };

    this.find = function(rezka_id, rezka_url) {
      var url = rezka_url || (api_url + 'films/' + rezka_id + '.html');

      end_search(url);

      function end_search(url) {
        network.clear();
        network.timeout(15000);
        var fullUrl = proxy_url + encodeURIComponent(url);
        
        network.silent(fullUrl, function(html) {
          if (html && html.length > 1000) {
            try {
              var parsedData = parseRezkaPage(html);
              if (parsedData.translations.length > 0) {
                success(parsedData, url);
                component.loading(false);
              } else {
                component.doesNotAnswer();
              }
            } catch (e) {
              console.error('Parse error:', e);
              component.doesNotAnswer();
            }
          } else {
            component.doesNotAnswer();
          }
        }, function(a, c) {
          console.error('Network error:', c);
          component.doesNotAnswer();
        });
      }
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
      if (results && results.data) {
        extractData(results.data);
        filter();
        append(filtred());
      }
    };

    this.filter = function(type, a, b) {
      choice[a.stype] = b.index;
      if (a.stype == 'voice') choice.voice_name = filter_items.voice[b.index];
      component.reset();
      if (results && results.data) {
        extractData(results.data);
        filter();
        append(filtred());
      }
    };

    this.destroy = function() {
      network.clear();
      results = null;
    };

    function success(data, baseUrl) {
      results = {
        data: data,
        baseUrl: baseUrl
      };
      extractData(data);
      filter();
      append(filtred());
    }

    function extractData(data) {
      extract = {};
      
      if (data.translations && data.translations.length > 0) {
        data.translations.forEach(function(translation, index) {
          var translationKey = index + 1;
          extract[translationKey] = {
            translation: translation.name,
            translation_id: translation.id,
            json: []
          };

          // Обработка сезонов
          data.seasons.forEach(function(season) {
            var seasonEpisodes = data.episodes.filter(function(ep) {
              return ep.url.includes('season=' + season.id) || 
                     ep.url.includes('&id=' + season.id) ||
                     data.seasons.length === 1; // Для фильмов
            });
            
            var items = [];
            seasonEpisodes.forEach(function(episode, epIndex) {
              items.push({
                id: season.id + '_' + (epIndex + 1),
                comment: episode.name,
                file: '', // Будет получен при воспроизведении
                episode: epIndex + 1,
                season: parseInt(season.id),
                quality: 1080,
                qualities: [360, 480, 720, 1080],
                translation: translationKey,
                translation_id: translation.id,
                episode_url: episode.url,
                title: episode.name
              });
            });

            if (items.length > 0) {
              extract[translationKey].json.push({
                id: parseInt(season.id),
                comment: season.name,
                folder: items,
                translation: translationKey
              });
            }
          });

          // Если нет сезонов (для фильмов), создаем один
          if (extract[translationKey].json.length === 0 && data.episodes.length > 0) {
            extract[translationKey].json.push({
              id: 1,
              comment: 'Фильм',
              folder: [{
                id: '1_1',
                comment: data.episodes[0].name,
                file: '',
                episode: 1,
                season: 1,
                quality: 1080,
                qualities: [360, 480, 720, 1080],
                translation: translationKey,
                translation_id: translation.id,
                episode_url: data.episodes[0].url,
                title: data.episodes[0].name
              }],
              translation: translationKey
            });
          }
        });
      }
    }

    function getFile(element, max_quality) {
      return new Promise(function(resolve) {
        // Если URL уже получен
        if (element.file && element.file.startsWith('http')) {
          resolve({
            file: element.file,
            quality: element.qualities.reduce(function(acc, qual) {
              acc[qual + 'p'] = element.file;
              return acc;
            }, {})
          });
          return;
        }

        // Получение URL видео
        component.loading(true);
        getVideoUrl(element.episode_url, element.translation_id)
          .then(function(videoUrl) {
            component.loading(false);
            element.file = videoUrl;
            resolve({
              file: videoUrl,
              quality: element.qualities.reduce(function(acc, qual) {
                acc[qual + 'p'] = videoUrl;
                return acc;
              }, {})
            });
          })
          .catch(function(error) {
            component.loading(false);
            console.error('Error getting video URL:', error);
            Lampa.Noty.show('Ошибка получения видео: ' + error);
            resolve({
              file: '',
              quality: {}
            });
          });
      });
    }

    function filter() {
      filter_items = {
        season: [],
        voice: [],
        voice_info: []
      };

      if (results && results.data) {
        // Сезоны
        if (results.data.seasons && results.data.seasons.length > 0) {
          results.data.seasons.forEach(function(season) {
            filter_items.season.push(season.name);
          });
        } else {
          filter_items.season.push('Фильм');
        }

        // Переводы
        if (results.data.translations && results.data.translations.length > 0) {
          results.data.translations.forEach(function(translation) {
            filter_items.voice.push(translation.name);
            filter_items.voice_info.push({
              id: translation.id
            });
          });
        }

        if (choice.voice_name) {
          var inx = filter_items.voice.map(function(v) {
            return v.toLowerCase();
          }).indexOf(choice.voice_name.toLowerCase());
          if (inx == -1) choice.voice = 0;
          else if (inx !== choice.voice) {
            choice.voice = inx;
          }
        }
      }

      component.filter(filter_items, choice);
    }

    function filtred() {
      var filtred = [];

      if (results && results.data && results.data.translations && results.data.translations.length > 0) {
        var translationIndex = Math.min(choice.voice, results.data.translations.length - 1);
        var translation = results.data.translations[translationIndex];
        
        if (translation && extract[choice.voice + 1]) {
          var translationData = extract[choice.voice + 1];
          var seasonIndex = Math.min(choice.season, translationData.json.length - 1);
          
          if (translationData.json[seasonIndex]) {
            var seasonData = translationData.json[seasonIndex];
            
            seasonData.folder.forEach(function(media) {
              filtred.push({
                episode: parseInt(media.episode),
                season: media.season,
                title: media.title || media.comment,
                quality: media.quality + 'p',
                translation: media.translation,
                voice_name: translation.name,
                info: translation.name,
                episode_url: media.episode_url,
                translation_id: media.translation_id,
                qualities: media.qualities
              });
            });
          }
        }
      }

      return filtred;
    }

    function toPlayElement(element, videoUrl, qualityObj) {
      return {
        title: element.title,
        url: videoUrl,
        quality: qualityObj,
        timeline: element.timeline,
        callback: element.mark,
        element: element
      };
    }

    function append(items) {
      component.reset();
      
      if (items.length === 0) {
        component.empty();
        return;
      }

      component.draw(items, {
        similars: wait_similars,
        onEnter: function onEnter(item, html) {
          component.loading(true);
          
          getFile(item, item.quality).then(function(extra) {
            component.loading(false);
            
            if (extra.file) {
              var first = toPlayElement(item, extra.file, extra.quality);

              if (items.length > 1) {
                // Создаем плейлист для сериалов
                var playlist = [];
                var playPromises = items.map(function(elem) {
                  return getFile(elem, elem.quality).then(function(elemExtra) {
                    return toPlayElement(elem, elemExtra.file, elemExtra.quality);
                  });
                });

                Promise.all(playPromises).then(function(playlistItems) {
                  first.playlist = playlistItems;
                  Lampa.Player.play(first);
                  Lampa.Player.playlist(playlistItems);
                  item.mark();
                });
              } else {
                // Для одиночного видео
                Lampa.Player.play(first);
                item.mark();
              }
            } else {
              Lampa.Noty.show(Lampa.Lang.translate('online_nolink'));
            }
          });
        },
        onContextMenu: function onContextMenu(item, html, data, call) {
          getFile(item, item.quality).then(function(extra) {
            call(extra);
          });
        }
      });
    }
  }

  // Компонент интерфейса
  function component(object) {
    var network = new Lampa.Reguest();
    var scroll = new Lampa.Scroll({
      mask: true,
      over: true
    });
    var files = new Lampa.Explorer(object);
    var filter = new Lampa.Filter(object);
    var sources = {
      rezkaapi: rezkaapi
    };
    var last;
    var extended;
    var selected_id;
    var source;
    var balanser = 'rezkaapi';
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
        var year = ((elem.year || '') + '').slice(0, 4);
        if (year) info.push(year);

        var name = elem.title || 'Без названия';
        elem.title = name;
        elem.time = '';
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
        network.native(baseurl, function(data) {
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
            info: element.info || '',
            quality: element.quality || '',
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
              balanser_name: 'Rezka.ag',
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

            if (episode.still_path) {
              img.onerror = function() {
                img.src = './img/img_broken.svg';
              };

              img.onload = function() {
                image.addClass('online-prestige__img--loaded');
                loader.remove();
                image.append('<div class="online-prestige__episode-number">' + ('0' + episode.episode_number).slice(-2) + '</div>');
              };

              img.src = Lampa.TMDB.image('t/p/w300' + episode.still_path);
              images.push(img);
            } else {
              loader.remove();
              image.append('<div class="online-prestige__episode-number">' + ('0' + episode.episode_number).slice(-2) + '</div>');
            }

            html.on('hover:focus', function(e) {
              last = e.target;
              scroll.update($(e.target), true);
            });
            scroll.append(html);
          });
        }

        if (scroll_to_element) {
          last = scroll_to_element[0];
        } else if (scroll_to_mark) {
          last = scroll_to_mark[0];
        }

        Lampa.Controller.enable('content');
      });
    };

    this.contextMenu = function(params) {
      params.html.on('hover:long', function() {
        function show(extra) {
          var enabled = Lampa.Controller.enabled().name;
          var menu = [];

          if (Lampa.Platform.is('webos')) {
            menu.push({
              title: Lampa.Lang.translate('player_lauch') + ' - Webos',
              player: 'webos'
            });
          }

          if (Lampa.Platform.is('android')) {
            menu.push({
              title: Lampa.Lang.translate('player_lauch') + ' - Android',
              player: 'android'
            });
          }

          menu.push({
            title: Lampa.Lang.translate('player_lauch') + ' - Lampa',
            player: 'lampa'
          });
          menu.push({
            title: Lampa.Lang.translate('online_video'),
            separator: true
          });
          menu.push({
            title: Lampa.Lang.translate('torrent_parser_label_title'),
            mark: true
          });
          menu.push({
            title: Lampa.Lang.translate('torrent_parser_label_cancel_title'),
            unmark: true
          });
          menu.push({
            title: Lampa.Lang.translate('time_reset'),
            timeclear: true
          });

          if (extra) {
            menu.push({
              title: Lampa.Lang.translate('copy_link'),
              copylink: true
            });
          }

          menu.push({
            title: Lampa.Lang.translate('more'),
            separator: true
          });

          if (Lampa.Account.logged() && params.element && typeof params.element.season !== 'undefined' && params.element.translate_voice) {
            menu.push({
              title: Lampa.Lang.translate('online_voice_subscribe'),
              subscribe: true
            });
          }

          menu.push({
            title: Lampa.Lang.translate('online_clear_all_marks'),
            clearallmark: true
          });
          menu.push({
            title: Lampa.Lang.translate('online_clear_all_timecodes'),
            timeclearall: true
          });
          Lampa.Select.show({
            title: Lampa.Lang.translate('title_action'),
            items: menu,
            onBack: function onBack() {
              Lampa.Controller.toggle(enabled);
            },
            onSelect: function onSelect(a) {
              if (a.mark) params.element.mark();
              if (a.unmark) params.element.unmark();
              if (a.timeclear) params.element.timeclear();
              if (a.clearallmark) params.onClearAllMark();
              if (a.timeclearall) params.onClearAllTime();
              Lampa.Controller.toggle(enabled);

              if (a.player) {
                Lampa.Player.runas(a.player);
                params.html.trigger('hover:enter');
              }

              if (a.copylink) {
                if (extra.quality) {
                  var qual = [];

                  for (var i in extra.quality) {
                    qual.push({
                      title: i,
                      file: extra.quality[i]
                    });
                  }

                  Lampa.Select.show({
                    title: Lampa.Lang.translate('settings_server_links'),
                    items: qual,
                    onBack: function onBack() {
                      Lampa.Controller.toggle(enabled);
                    },
                    onSelect: function onSelect(b) {
                      Lampa.Utils.copyTextToClipboard(b.file, function() {
                        Lampa.Noty.show(Lampa.Lang.translate('copy_secuses'));
                      }, function() {
                        Lampa.Noty.show(Lampa.Lang.translate('copy_error'));
                      });
                    }
                  });
                } else {
                  Lampa.Utils.copyTextToClipboard(extra.file, function() {
                    Lampa.Noty.show(Lampa.Lang.translate('copy_secuses'));
                  }, function() {
                    Lampa.Noty.show(Lampa.Lang.translate('copy_error'));
                  });
                }
              }

              if (a.subscribe) {
                Lampa.Account.subscribeToTranslation({
                  card: object.movie,
                  season: params.element.season,
                  episode: params.element.translate_episode_end,
                  voice: params.element.translate_voice
                }, function() {
                  Lampa.Noty.show(Lampa.Lang.translate('online_voice_success'));
                }, function() {
                  Lampa.Noty.show(Lampa.Lang.translate('online_voice_error'));
                });
              }
            }
          });
        }

        params.onFile(show);
      }).on('hover:focus', function() {
        if (Lampa.Helper) Lampa.Helper.show('online_file', Lampa.Lang.translate('helper_online_file'), params.html);
      });
    };

    this.empty = function(msg) {
      var html = Lampa.Template.get('online_does_not_answer', {});
      html.find('.online-empty__buttons').remove();
      html.find('.online-empty__title').text(Lampa.Lang.translate('empty_title_two'));
      scroll.append(html);
      this.loading(false);
    };

    this.doesNotAnswer = function() {
      var _this6 = this;

      this.reset();
      var html = Lampa.Template.get('online_does_not_answer', {
        balanser: balanser
      });

      scroll.append(html);
      this.loading(false);
    };

    this.getLastEpisode = function(items) {
      var last_episode = 0;
      items.forEach(function(e) {
        if (typeof e.episode !== 'undefined') last_episode = Math.max(last_episode, parseInt(e.episode));
      });
      return last_episode;
    };

    this.start = function() {
      if (Lampa.Activity.active().activity !== this.activity) return;

      if (!initialized) {
        initialized = true;
        this.initialize();
      }

      Lampa.Background.immediately(Lampa.Utils.cardImgBackgroundBlur(object.movie));
      Lampa.Controller.add('content', {
        toggle: function toggle() {
          Lampa.Controller.collectionSet(scroll.render(), files.render());
          Lampa.Controller.collectionFocus(last || false, scroll.render());
        },
        up: function up() {
          if (Navigator.canmove('up')) {
            Navigator.move('up');
          } else Lampa.Controller.toggle('head');
        },
        down: function down() {
          Navigator.move('down');
        },
        right: function right() {
          if (Navigator.canmove('right')) Navigator.move('right');
          else filter.show(Lampa.Lang.translate('title_filter'), 'filter');
        },
        left: function left() {
          if (Navigator.canmove('left')) Navigator.move('left');
          else Lampa.Controller.toggle('menu');
        },
        gone: function gone() {
          clearInterval(balanser_timer);
        },
        back: this.back
      });
      Lampa.Controller.toggle('content');
    };

    this.render = function() {
      return files.render();
    };

    this.back = function() {
      Lampa.Activity.backward();
    };

    this.pause = function() {};

    this.stop = function() {};

    this.destroy = function() {
      network.clear();
      this.clearImages();
      files.destroy();
      scroll.destroy();
      clearInterval(balanser_timer);
      if (source && source.destroy) source.destroy();
      if (modalopen) {modalopen = false; Lampa.Modal.close();}
    };
  }

  function startPlugin() {
    window.online_rezka = true;
    var manifest = {
      type: 'video',
      version: '1.0.0',
      name: 'Онлайн - Rezka.ag',
      description: 'Плагин для просмотра онлайн сериалов и фильмов с Rezka.ag',
      component: 'online_rezkaapi',
      onContextMenu: function onContextMenu(object) {
        return {
          name: Lampa.Lang.translate('online_watch'),
          description: 'Rezka.ag'
        };
      },
      onContextLauch: function onContextLauch(object) {
        resetTemplates();
        Lampa.Component.add('online_rezkaapi', component);
        Lampa.Activity.push({
          url: '',
          title: Lampa.Lang.translate('title_online'),
          component: 'online_rezkaapi',
          search: object.title,
          search_one: object.title,
          search_two: object.original_title,
          movie: object,
          page: 1
        });
      }
    };

    Lampa.Manifest.plugins = manifest;
    
    Lampa.Lang.add({
      online_watch: {
        ru: 'Смотреть онлайн (Rezka)',
        en: 'Watch online (Rezka)',
        ua: 'Дивитися онлайн (Rezka)',
        zh: '在线观看 (Rezka)'
      },
      online_video: {
        ru: 'Видео',
        en: 'Video',
        ua: 'Відео',
        zh: '视频'
      },
      online_nolink: {
        ru: 'Не удалось извлечь ссылку',
        uk: 'Неможливо отримати посилання',
        en: 'Failed to fetch link',
        zh: '获取链接失败'
      },
      helper_online_file: {
        ru: 'Удерживайте клавишу "ОК" для вызова контекстного меню',
        uk: 'Утримуйте клавішу "ОК" для виклику контекстного меню',
        en: 'Hold the "OK" key to bring up the context menu',
        zh: '按住"确定"键调出上下文菜单'
      },
      title_online: {
        ru: 'Онлайн',
        uk: 'Онлайн',
        en: 'Online',
        zh: '在线的'
      },
      copy_secuses: {
        ru: 'Код скопирован в буфер обмена',
        uk: 'Код скопійовано в буфер обміну',
        en: 'Code copied to clipboard',
        zh: '代码复制到剪贴板'
      },
      copy_fail: {
        ru: 'Ошибка при копировании',
        uk: 'Помилка при копіюванні',
        en: 'Copy error',
        zh: '复制错误'
      },
      title_status: {
        ru: 'Статус',
        uk: 'Статус',
        en: 'Status',
        zh: '地位'
      },
      online_voice_subscribe: {
        ru: 'Подписаться на перевод',
        uk: 'Підписатися на переклад',
        en: 'Subscribe to translation',
        zh: '订阅翻译'
      },
      online_voice_success: {
        ru: 'Вы успешно подписались',
        uk: 'Ви успішно підписалися',
        en: 'You have successfully subscribed',
        zh: '您已成功订阅'
      },
      online_voice_error: {
        ru: 'Возникла ошибка',
        uk: 'Виникла помилка',
        en: 'An error has occurred',
        zh: '发生了错误'
      },
      online_clear_all_marks: {
        ru: 'Очистить все метки',
        uk: 'Очистити всі мітки',
        en: 'Clear all labels',
        zh: '清除所有标签'
      },
      online_clear_all_timecodes: {
        ru: 'Очистить все тайм-коды',
        uk: 'Очистити всі тайм-коди',
        en: 'Clear all timecodes',
        zh: '清除所有时间代码'
      },
      online_balanser_dont_work: {
        ru: 'Поиск не дал результатов',
        uk: 'Пошук не дав результатів',
        en: 'The search did not return any results',
        zh: '搜索没有返回任何结果'
      },
      torrent_serial_season: {
        ru: 'Сезон',
        en: 'Season', 
        ua: 'Сезон',
        zh: '季节'
      },
      torrent_parser_voice: {
        ru: 'Озвучка',
        en: 'Voice',
        ua: 'Озвучення',
        zh: '语音'
      },
      torrent_parser_reset: {
        ru: 'Сбросить',
        en: 'Reset',
        ua: 'Скинути',
        zh: '重置'
      }
    });

    Lampa.Template.add('online_prestige_css', `
        <style>
        .online-prestige{position:relative;border-radius:.3em;background-color:rgba(0,0,0,0.3);display:flex}
        .online-prestige__body{padding:1.2em;line-height:1.3;flex-grow:1;position:relative}
        .online-prestige__img{position:relative;width:13em;flex-shrink:0;min-height:8.2em}
        .online-prestige__img>img{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;border-radius:.3em;opacity:0;transition:opacity .3s}
        .online-prestige__img--loaded>img{opacity:1}
        .online-prestige__viewed{position:absolute;top:1em;left:1em;background:rgba(0,0,0,0.45);border-radius:100%;padding:.25em;font-size:.76em}
        .online-prestige__viewed>svg{width:1.5em !important;height:1.5em !important}
        .online-prestige__episode-number{position:absolute;top:0;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;font-size:2em}
        .online-prestige__loader{position:absolute;top:50%;left:50%;width:2em;height:2em;margin-left:-1em;margin-top:-1em;background:url(./img/loader.svg) no-repeat center center;background-size:contain}
        .online-prestige__head,.online-prestige__footer{display:flex;justify-content:space-between;align-items:center}
        .online-prestige__timeline{margin:.8em 0}
        .online-prestige__timeline>.time-line{display:block !important}
        .online-prestige__title{font-size:1.7em;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:1;line-clamp:1;-webkit-box-orient:vertical}
        .online-prestige__time{padding-left:2em}
        .online-prestige__info{display:flex;align-items:center}
        .online-prestige__info>*{overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:1;line-clamp:1;-webkit-box-orient:vertical}
        .online-prestige__quality{padding-left:1em;white-space:nowrap}
        .online-prestige .online-prestige-split{font-size:.8em;margin:0 1em;flex-shrink:0}
        .online-prestige.focus::after{content:'';position:absolute;top:-0.6em;left:-0.6em;right:-0.6em;bottom:-0.6em;border-radius:.7em;border:solid .3em #fff;z-index:-1;pointer-events:none}
        .online-prestige+.online-prestige{margin-top:1.5em}
        .online-empty{line-height:1.4}
        .online-empty__title{font-size:2em;margin-bottom:.9em}
        </style>
    `);
    
    $('body').append(Lampa.Template.get('online_prestige_css', {}, true));

    function resetTemplates() {
      Lampa.Template.add('online_prestige_full', "<div class=\"online-prestige online-prestige--full selector\"><div class=\"online-prestige__img\"><img alt=\"\"><div class=\"online-prestige__loader\"></div></div><div class=\"online-prestige__body\"><div class=\"online-prestige__head\"><div class=\"online-prestige__title\">{title}</div><div class=\"online-prestige__time\">{time}</div></div><div class=\"online-prestige__timeline\"></div><div class=\"online-prestige__footer\"><div class=\"online-prestige__info\">{info}</div><div class=\"online-prestige__quality\">{quality}</div></div></div></div>");
      Lampa.Template.add('online_does_not_answer', "<div class=\"online-empty\"><div class=\"online-empty__title\">#{online_balanser_dont_work}</div><div class=\"online-empty__templates\"><div class=\"online-empty-template\"><div class=\"online-empty-template__ico\"></div><div class=\"online-empty-template__body\"></div></div><div class=\"online-empty-template\"><div class=\"online-empty-template__ico\"></div><div class=\"online-empty-template__body\"></div></div><div class=\"online-empty-template\"><div class=\"online-empty-template__ico\"></div><div class=\"online-empty-template__body\"></div></div></div></div>");
      Lampa.Template.add('online_prestige_rate', "<div class=\"online-prestige-rate\"><svg width=\"17\" height=\"16\" viewBox=\"0 0 17 16\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M8.39409 0.192139L10.99 5.30994L16.7882 6.20387L12.5475 10.4277L13.5819 15.9311L8.39409 13.2425L3.20626 15.9311L4.24065 10.4277L0 6.20387L5.79819 5.30994L8.39409 0.192139Z\" fill=\"#fff\"></path></svg><span>{rate}</span></div>");
      Lampa.Template.add('online_prestige_folder', "<div class=\"online-prestige online-prestige--folder selector\"><div class=\"online-prestige__folder\"><svg viewBox=\"0 0 128 112\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><rect y=\"20\" width=\"128\" height=\"92\" rx=\"13\" fill=\"white\"></rect><path d=\"M29.9963 8H98.0037C96.0446 3.3021 91.4079 0 86 0H42C36.5921 0 31.9555 3.3021 29.9963 8Z\" fill=\"white\" fill-opacity=\"0.23\"></path><rect x=\"11\" y=\"8\" width=\"106\" height=\"76\" rx=\"13\" fill=\"white\" fill-opacity=\"0.51\"></rect></svg></div><div class=\"online-prestige__body\"><div class=\"online-prestige__head\"><div class=\"online-prestige__title\">{title}</div><div class=\"online-prestige__time\">{time}</div></div><div class=\"online-prestige__footer\"><div class=\"online-prestige__info\">{info}</div></div></div></div>");
    }

    var button = "<div class=\"full-start__button selector view--online\" data-subtitle=\"Rezka v" + manifest.version + "\"><svg width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M8 5V19L19 12L8 5Z\" fill=\"currentColor\"/></svg><span>#{title_online}</span></div>";

    Lampa.Component.add('online_rezkaapi', component);
    resetTemplates();

    Lampa.Listener.follow('full', function(e) {
      if (e.type == 'complite') {
        var btn = $(button);
        btn.on('hover:enter', function() {
          resetTemplates();
          Lampa.Component.add('online_rezkaapi', component);
          Lampa.Activity.push({
            url: '',
            title: Lampa.Lang.translate('title_online'),
            component: 'online_rezkaapi',
            search: e.data.movie.title,
            search_one: e.data.movie.title,
            search_two: e.data.movie.original_title,
            movie: e.data.movie,
            page: 1
          });
        });
        e.object.activity.render().find('.view--torrent').after(btn);
      }
    });

    window.rezkaapi = {
      max_qualitie: 1080,
      is_max_qualitie: false
    };
  }

  if (!window.online_rezka && Lampa.Manifest.app_digital >= 155) startPlugin();

})();
// V1
