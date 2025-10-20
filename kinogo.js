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

    // Улучшенный парсинг HTML страницы Kinogo
    function parseKinogoPage(html) {
      var results = {
        player_links: {
          playlist: {},
          movie: []
        },
        last_episode: {}
      };

      try {
        // Парсим сериалы - ищем блоки с сезонами
        var seasonBlocks = html.match(/<div class="shortstory[^>]*>[\s\S]*?<\/div><\/div><\/div>/g);
        if (!seasonBlocks) {
          // Альтернативный поиск сериалов
          seasonBlocks = html.match(/<div class=[\"']serial-series[\"'][^>]*>[\s\S]*?<\/div><\/div><\/div>/gi);
        }
        
        if (seasonBlocks) {
          seasonBlocks.forEach(function(seasonBlock, seasonIndex) {
            var seasonNum = seasonIndex + 1;
            results.player_links.playlist[seasonNum] = {};
            
            // Парсим переводы
            var voiceBlocks = seasonBlock.match(/<ul[^>]*class=[\"']serial-translation__list[\"'][^>]*>[\s\S]*?<\/ul>/gi);
            if (!voiceBlocks) {
              voiceBlocks = seasonBlock.match(/<div[^>]*class=[\"']serial-translation[\"'][^>]*>[\s\S]*?<\/div>/gi);
            }
            
            if (voiceBlocks) {
              voiceBlocks.forEach(function(voiceBlock, voiceIndex) {
                var voiceMatch = voiceBlock.match(/<div[^>]*class=[\"']serial-translation__title[\"'][^>]*>([^<]*)</i);
                var voiceName = voiceMatch ? voiceMatch[1].trim() : 'Перевод ' + (voiceIndex + 1);
                
                results.player_links.playlist[seasonNum][voiceName] = {};
                
                // Парсим эпизоды
                var episodeLinks = voiceBlock.match(/<a[^>]*href=[\"']([^\"']*)[\"'][^>]*>[\s\S]*?<\/a>/gi);
                if (episodeLinks) {
                  episodeLinks.forEach(function(episodeLink, episodeIndex) {
                    var urlMatch = episodeLink.match(/href=[\"']([^\"']*)[\"']/i);
                    var numMatch = episodeLink.match(/<span[^>]*class=[\"']serial-series__num[\"'][^>]*>([^<]*)</i) || 
                                  episodeLink.match(/>\s*(\d+)\s*</);
                    
                    if (urlMatch) {
                      var episodeNum = numMatch ? parseInt(numMatch[1]) : (episodeIndex + 1);
                      var episodeUrl = urlMatch[1].startsWith('http') ? urlMatch[1] : api_url + urlMatch[1].replace(/^\//, '');
                      
                      results.player_links.playlist[seasonNum][voiceName][episodeNum] = {
                        link: episodeUrl,
                        qualities: [360, 480, 720, 1080]
                      };
                    }
                  });
                }
              });
            }
          });
        }

        // Парсим фильмы - ищем iframe и video источники
        var moviePlayers = html.match(/<iframe[^>]*src=[\"']([^\"']*)[\"'][^>]*>/gi);
        if (!moviePlayers) {
          moviePlayers = html.match(/<video[^>]*>[\s\S]*?<\/video>/gi);
        }
        
        if (moviePlayers && !seasonBlocks) {
          moviePlayers.forEach(function(player, index) {
            var srcMatch = player.match(/src=[\"']([^\"']*)[\"']/i);
            if (srcMatch) {
              results.player_links.movie.push({
                link: srcMatch[1],
                translation: 'Основной перевод',
                qualities: [360, 480, 720, 1080]
              });
            }
          });
        }

        // Если не нашли стандартные плееры, ищем ссылки на внешние видео
        if (results.player_links.movie.length === 0 && results.player_links.playlist.length === 0) {
          var videoLinks = html.match(/(https?:[^"'\s]*\.(mp4|m3u8|mkv|avi)[^"'\s]*)/gi);
          if (videoLinks) {
            videoLinks.forEach(function(link) {
              results.player_links.movie.push({
                link: link,
                translation: 'Прямая ссылка',
                qualities: [720]
              });
            });
          }
        }

        // Определяем последний эпизод для сериалов
        if (seasonBlocks && seasonBlocks.length > 0) {
          var lastSeason = Object.keys(results.player_links.playlist).length;
          var lastEpisode = 0;
          for (var season in results.player_links.playlist) {
            for (var voice in results.player_links.playlist[season]) {
              var episodes = Object.keys(results.player_links.playlist[season][voice]);
              var maxEpisode = Math.max.apply(null, episodes.map(Number));
              lastEpisode = Math.max(lastEpisode, maxEpisode);
            }
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

    // Улучшенный поиск на Kinogo
    this.searchByTitle = function(_object, query) {
      var _this = this;
      object = _object;
      
      var year = parseInt((object.movie.release_date || object.movie.first_air_date || '0000').slice(0, 4));
      var orig = object.movie.original_name || object.movie.original_title;
      var title = object.movie.title || object.movie.name;
      
      // Очищаем запрос от специальных символов
      var cleanQuery = query.replace(/[^\w\sа-яА-ЯёЁ]/gi, ' ').trim();
      
      // Формируем URL для поиска на Kinogo
      var searchUrl = api_url + 'index.php?do=search';
      
      // Параметры для POST запроса
      var postData = {
        do: 'search',
        subaction: 'search',
        story: cleanQuery
      };
      
      network.clear();
      network.timeout(15000);
      
      // Отправляем POST запрос для поиска
      network.native(searchUrl, function(html) {
        if (!html || html.length < 1000) {
          component.doesNotAnswer();
          return;
        }
        
        // Парсим результаты поиска
        var searchResults = [];
        var itemMatches = html.match(/<div class=\"shortstory[^>]*>[\s\S]*?<h2>[^<]*<a href=\"([^\"]*)\"[^>]*>([^<]*)<\/a>[\s\S]*?<\/div>/g);
        
        if (!itemMatches) {
          // Альтернативный парсинг
          itemMatches = html.match(/<article[^>]*>[\s\S]*?<a href=\"([^\"]*)\"[^>]*>([^<]*)<\/a>[\s\S]*?<\/article>/gi);
        }
        
        if (itemMatches) {
          itemMatches.forEach(function(item) {
            var titleMatch = item.match(/<a href=\"([^\"]*)\"[^>]*>([^<]*)<\/a>/);
            var yearMatch = item.match(/(19|20)\d{2}/);
            
            if (titleMatch && titleMatch[2]) {
              var itemTitle = titleMatch[2].replace(/<\/?[^>]+>/gi, '').trim();
              var itemYear = yearMatch ? parseInt(yearMatch[0]) : year;
              var itemUrl = titleMatch[1].startsWith('http') ? titleMatch[1] : api_url + titleMatch[1].replace(/^\//, '');
              
              // Проверяем соответствие
              if (Math.abs(itemYear - year) <= 2) {
                var normalizedItem = normalizeString(itemTitle);
                var normalizedSearch = normalizeString(title);
                
                // Проверяем схожесть названий
                if (normalizedItem.includes(normalizedSearch) || 
                    normalizedSearch.includes(normalizedItem) ||
                    calculateSimilarity(normalizedItem, normalizedSearch) > 0.6) {
                  
                  searchResults.push({
                    id: itemUrl,
                    title: itemTitle,
                    year: itemYear,
                    url: itemUrl,
                    similarity: calculateSimilarity(normalizedItem, normalizedSearch)
                  });
                }
              }
            }
          });
        }
        
        // Сортируем по схожести
        searchResults.sort(function(a, b) {
          return b.similarity - a.similarity;
        });
        
        if (searchResults.length > 0) {
          // Берем наиболее подходящий результат
          var bestMatch = searchResults[0];
          _this.find(bestMatch.url);
        } else {
          // Если не нашли через поиск, пробуем прямой URL
          var directUrl = generateDirectUrl(title, year);
          network.silent(proxy_url + directUrl, function(html) {
            if (html && html.length > 1000) {
              _this.find(directUrl);
            } else {
              component.doesNotAnswer();
            }
          }, function() {
            component.doesNotAnswer();
          });
        }
        
      }, function(a, c) {
        // Если POST запрос не работает, пробуем GET
        var getSearchUrl = api_url + 'index.php?do=search&subaction=search&story=' + encodeURIComponent(cleanQuery);
        network.silent(proxy_url + getSearchUrl, function(html) {
          if (html && html.length > 1000) {
            // Парсим результаты аналогично
            var searchResults = [];
            var itemMatches = html.match(/<div class=\"shortstory[^>]*>[\s\S]*?<h2>[^<]*<a href=\"([^\"]*)\"[^>]*>([^<]*)<\/a>[\s\S]*?<\/div>/g);
            
            if (itemMatches) {
              itemMatches.forEach(function(item) {
                var titleMatch = item.match(/<a href=\"([^\"]*)\"[^>]*>([^<]*)<\/a>/);
                if (titleMatch) {
                  searchResults.push({
                    id: titleMatch[1],
                    title: titleMatch[2],
                    url: api_url + titleMatch[1].replace(/^\//, '')
                  });
                }
              });
            }
            
            if (searchResults.length > 0) {
              _this.find(searchResults[0].url);
            } else {
              component.doesNotAnswer();
            }
          } else {
            component.doesNotAnswer();
          }
        }, function() {
          component.doesNotAnswer();
        });
      }, 'POST', postData);
    };

    // Функция для расчета схожести строк
    function calculateSimilarity(str1, str2) {
      var longer = str1;
      var shorter = str2;
      if (str1.length < str2.length) {
        longer = str2;
        shorter = str1;
      }
      var longerLength = longer.length;
      if (longerLength === 0) {
        return 1.0;
      }
      return (longerLength - editDistance(longer, shorter)) / parseFloat(longerLength);
    }

    // Расстояние Левенштейна
    function editDistance(s1, s2) {
      s1 = s1.toLowerCase();
      s2 = s2.toLowerCase();

      var costs = [];
      for (var i = 0; i <= s1.length; i++) {
        var lastValue = i;
        for (var j = 0; j <= s2.length; j++) {
          if (i === 0)
            costs[j] = j;
          else {
            if (j > 0) {
              var newValue = costs[j - 1];
              if (s1.charAt(i - 1) !== s2.charAt(j - 1))
                newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
              costs[j - 1] = lastValue;
              lastValue = newValue;
            }
          }
        }
        if (i > 0)
          costs[s2.length] = lastValue;
      }
      return costs[s2.length];
    }

    // Генерация прямого URL на основе названия
    function generateDirectUrl(title, year) {
      var slug = title.toLowerCase()
        .replace(/[^\w\sа-яё]/gi, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
      
      return api_url + 'filmi/' + slug + '-' + year + '.html';
    }

    function normalizeString(str) {
      return str.toLowerCase()
        .replace(/[^a-zа-я0-9]/g, '')
        .replace(/ё/g, 'е');
    }

    this.search = function(_object, sim) {
      if (wait_similars) this.find(sim[0].id);
    };

    this.find = function(kinogo_url) {
      network.clear();
      network.timeout(15000);
      
      console.log('Fetching Kinogo URL:', kinogo_url);
      
      network.silent(proxy_url + kinogo_url, function(html) {
        if (html && html.length > 1000) {
          var parsedData = parseKinogoPage(html);
          console.log('Parsed data:', parsedData);
          
          if ((parsedData.player_links.playlist && Object.keys(parsedData.player_links.playlist).length > 0) || 
              (parsedData.player_links.movie && parsedData.player_links.movie.length > 0)) {
            success(parsedData);
            component.loading(false);
          } else {
            console.log('No video links found');
            component.doesNotAnswer();
          }
        } else {
          console.log('Empty or invalid response');
          component.doesNotAnswer();
        }
      }, function(a, c) {
        console.log('Network error:', a, c);
        component.doesNotAnswer();
      });
    };

    // Остальные функции остаются без изменений
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
            quality[q + 'p'] = file;
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
            var playlist = [];
            var first = toPlayElement(item);

            if (item.season) {
              items.forEach(function(elem) {
                playlist.push(toPlayElement(elem));
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
        },
        onContextMenu: function onContextMenu(item, html, data, call) {
          call(getFile(item, item.quality));
        }
      });
    }
  }

  // Остальная часть кода (component функция и startPlugin) остается без изменений
  // ... [остальной код без изменений]
