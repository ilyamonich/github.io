(function() {
  'use strict';

  var kinogo_base = 'https://kinogo.ec';
  var search_url = 'https://kinogo.ec/index.php?do=search';
  var modalopen = false;

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

    function parseSearchResults(html) {
      var results = [];
      try {
        var parser = new DOMParser();
        var doc = parser.parseFromString(html, 'text/html');
        
        // Несколько возможных селекторов для поиска результатов
        var selectors = [
          '.shortstory',
          '.search-result',
          '.item',
          '.film-item',
          '.movie-item'
        ];
        
        var items = [];
        for (var i = 0; i < selectors.length; i++) {
          items = doc.querySelectorAll(selectors[i]);
          if (items.length > 0) break;
        }
        
        items.forEach(function(item) {
          try {
            var titleElem = item.querySelector('h2 a, .title a, .name a, a[href*="/film"]');
            if (!titleElem) return;
            
            var link = titleElem.href;
            if (!link.startsWith('http')) {
              link = kinogo_base + link;
            }
            
            var title = titleElem.textContent.trim();
            var imageElem = item.querySelector('img');
            var image = imageElem ? imageElem.src : '';
            if (image && !image.startsWith('http')) {
              image = kinogo_base + image;
            }
            
            // Пытаемся извлечь год из описания
            var year = null;
            var yearMatch = item.textContent.match(/(19|20)\d{2}/);
            if (yearMatch) year = parseInt(yearMatch[0]);
            
            results.push({
              id: link.split('/').pop().replace('.html', ''),
              title: title,
              original_title: title,
              year: year,
              url: link,
              image: image
            });
          } catch (e) {
            console.log('Error parsing search item:', e);
          }
        });
      } catch (e) {
        console.log('Error parsing search results:', e);
      }
      return results;
    }

    function parseMoviePage(html) {
      var result = {
        player_links: {
          playlist: {},
          movie: []
        },
        title: ''
      };
      
      try {
        var parser = new DOMParser();
        var doc = parser.parseFromString(html, 'text/html');
        
        // Получаем заголовок
        var titleElem = doc.querySelector('h1, .title, .name');
        if (titleElem) {
          result.title = titleElem.textContent.trim();
        }
        
        // Ищем все возможные источники видео
        var videoSources = [];
        
        // 1. Iframe с видео
        var iframes = doc.querySelectorAll('iframe');
        iframes.forEach(function(iframe, index) {
          if (iframe.src && iframe.src.includes('//')) {
            videoSources.push({
              link: iframe.src,
              translation: 'Iframe ' + (index + 1),
              type: 'iframe'
            });
          }
        });
        
        // 2. Ссылки с data-link атрибутами
        var dataLinks = doc.querySelectorAll('[data-link]');
        dataLinks.forEach(function(link, index) {
          var videoUrl = link.getAttribute('data-link');
          if (videoUrl && (videoUrl.includes('//') || videoUrl.includes('.mp4') || videoUrl.includes('.m3u8'))) {
            videoSources.push({
              link: videoUrl,
              translation: 'Player ' + (index + 1),
              type: 'direct'
            });
          }
        });
        
        // 3. Прямые ссылки на видео файлы
        var videoLinks = doc.querySelectorAll('a[href*=".mp4"], a[href*=".m3u8"]');
        videoLinks.forEach(function(link, index) {
          var videoUrl = link.href;
          if (videoUrl && videoUrl.includes('//')) {
            videoSources.push({
              link: videoUrl,
              translation: 'Direct ' + (index + 1),
              type: 'direct'
            });
          }
        });
        
        // 4. Scripts с видео ссылками
        var scripts = doc.querySelectorAll('script');
        scripts.forEach(function(script) {
          var scriptText = script.textContent || script.innerText;
          if (scriptText) {
            // Ищем URL в скриптах
            var urlMatches = scriptText.match(/(https?:\/\/[^\s"']*\.(?:mp4|m3u8)[^\s"']*)/gi);
            if (urlMatches) {
              urlMatches.forEach(function(url, index) {
                videoSources.push({
                  link: url,
                  translation: 'Script ' + (index + 1),
                  type: 'script'
                });
              });
            }
          }
        });
        
        // Добавляем найденные источники
        videoSources.forEach(function(source, index) {
          result.player_links.movie.push({
            link: source.link,
            translation: source.translation,
            type: source.type
          });
        });
        
      } catch (e) {
        console.log('Error parsing movie page:', e);
      }
      
      return result;
    }

    this.search = function(_object, sim) {
      if (wait_similars) this.find(sim[0].id, sim[0].url);
    };

    function normalizeString(str) {
      return str.toLowerCase()
        .replace(/[^a-zа-я0-9]/g, '')
        .replace(/ё/g, 'е');
    }

    function findBestMatch(results, originalTitle, year) {
      if (!results.length) return null;
      
      var normalizedOriginal = normalizeString(originalTitle);
      
      // Сначала ищем точное совпадение по названию и году
      var exactMatch = results.find(function(item) {
        var normalizedItem = normalizeString(item.title);
        return normalizedItem === normalizedOriginal && 
               (!item.year || item.year === year);
      });
      
      if (exactMatch) return exactMatch;
      
      // Затем ищем частичное совпадение
      var partialMatch = results.find(function(item) {
        var normalizedItem = normalizeString(item.title);
        return normalizedItem.includes(normalizedOriginal) || 
               normalizedOriginal.includes(normalizedItem);
      });
      
      if (partialMatch) return partialMatch;
      
      // Возвращаем первый результат
      return results[0];
    }

    this.searchByTitle = function(_object, query) {
      var _this = this;
      object = _object;
      
      var year = parseInt((object.movie.release_date || object.movie.first_air_date || '0000').slice(0, 4));
      var orig = object.movie.original_name || object.movie.original_title || object.movie.title || object.movie.name;
      
      console.log('Searching for:', query, 'Year:', year, 'Original:', orig);
      
      // Формируем данные для поиска
      var searchQuery = encodeURIComponent(query);
      var url = search_url + '&do=search&subaction=search&story=' + searchQuery;
      
      network.clear();
      network.timeout(20000);
      
      // Добавляем заголовки чтобы выглядеть как браузер
      var options = {
        method: 'GET',
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'ru-RU,ru;q=0.8,en-US;q=0.5,en;q=0.3',
          'Cache-Control': 'no-cache',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      };
      
      network.native(url, options, function(html) {
        console.log('Search response received, length:', html.length);
        
        try {
          var searchResults = parseSearchResults(html);
          console.log('Found results:', searchResults.length);
          
          if (searchResults.length > 0) {
            var bestMatch = findBestMatch(searchResults, orig, year);
            
            if (bestMatch) {
              console.log('Best match found:', bestMatch.title, bestMatch.url);
              _this.find(bestMatch.id, bestMatch.url);
            } else {
              wait_similars = true;
              component.similars(searchResults);
              component.loading(false);
            }
          } else {
            console.log('No results found');
            // Пробуем альтернативный поиск
            tryAlternativeSearch(query, orig, year);
          }
        } catch (e) {
          console.error('Parse error:', e);
          component.doesNotAnswer();
        }
      }, function(a, c) {
        console.error('Network error:', a, c);
        // Пробуем альтернативный метод поиска
        tryAlternativeSearch(query, orig, year);
      });
      
      function tryAlternativeSearch(query, original, year) {
        console.log('Trying alternative search...');
        
        // Пробуем поиск по русскому названию
        var russianTitle = object.movie.title || object.movie.name;
        if (russianTitle && russianTitle !== original) {
          var russianQuery = encodeURIComponent(russianTitle);
          var russianUrl = search_url + '&do=search&subaction=search&story=' + russianQuery;
          
          network.native(russianUrl, options, function(html) {
            try {
              var altResults = parseSearchResults(html);
              if (altResults.length > 0) {
                var altMatch = findBestMatch(altResults, russianTitle, year);
                if (altMatch) {
                  _this.find(altMatch.id, altMatch.url);
                  return;
                }
              }
            } catch (e) {
              console.error('Alternative search error:', e);
            }
            component.doesNotAnswer();
          }, function(a, c) {
            component.doesNotAnswer();
          });
        } else {
          component.doesNotAnswer();
        }
      }
    };

    this.find = function(kinogo_id, kinogo_url) {
      console.log('Loading movie page:', kinogo_url);
      
      network.clear();
      network.timeout(20000);
      
      var options = {
        method: 'GET',
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'ru-RU,ru;q=0.8,en-US;q=0.5,en;q=0.3',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      };
      
      network.native(kinogo_url, options, function(html) {
        console.log('Movie page loaded, length:', html.length);
        
        try {
          var found = parseMoviePage(html);
          console.log('Found video sources:', found.player_links.movie.length);
          
          if (found && found.player_links.movie.length > 0) {
            success(found);
            component.loading(false);
          } else {
            console.log('No video sources found');
            component.doesNotAnswer();
          }
        } catch (e) {
          console.error('Parse movie error:', e);
          component.doesNotAnswer();
        }
      }, function(a, c) {
        console.error('Network movie error:', a, c);
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
      
      // Kinogo в основном для фильмов, но обрабатываем и сериалы если будут
      if (data.player_links.movie && data.player_links.movie.length > 0) {
        data.player_links.movie.forEach(function(movie, index) {
          extract[index + 1] = {
            file: movie.link,
            translation: movie.translation || 'Источник ' + (index + 1),
            quality: 1080,
            type: movie.type || 'unknown'
          };
        });
      }
    }

    function getFile(element, max_quality) {
      var translat = extract[element.translation];
      var file = '';
      var quality = false;

      if (translat) {
        file = translat.file;
      }

      if (file) {
        quality = {
          '1080p': file,
          '720p': file,
          '480p': file
        };
        
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

      // Создаем фильтры для различных источников видео
      for (var transl_id in extract) {
        var transl = extract[transl_id];
        filter_items.voice.push(transl.translation);
        filter_items.voice_info.push({
          id: parseInt(transl_id)
        });
      }

      component.filter(filter_items, choice);
    }

    function filtred() {
      var filtred = [];

      // Создаем элементы для каждого источника видео
      for (var transl_id in extract) {
        var _element = extract[transl_id];
        filtred.push({
          title: _element.translation,
          quality: '1080p',
          translation: parseInt(transl_id),
          voice_name: _element.translation,
          info: _element.type ? 'Тип: ' + _element.type : ''
        });
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
            playlist.push(first);

            if (playlist.length > 1) first.playlist = playlist;
            
            console.log('Playing video:', extra.file);
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

  // Компонент для отображения интерфейса
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
        var year = ((elem.year || '') + '').slice(0, 4);
        if (year) info.push(year);

        var name = elem.title || elem.original_title || '';
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
      
      var viewed = Lampa.Storage.cache('online_view', 5000, []);
      var serial = object.movie.name ? true : false;
      var choice = _this5.getChoice();
      var fully = window.innerWidth > 480;
      var scroll_to_element = false;
      var scroll_to_mark = false;
      
      items.forEach(function(element, index) {
        Lampa.Arrays.extend(element, {
          info: element.info || '',
          quality: element.quality || '1080p',
          time: Lampa.Utils.secondsToTime(object.movie.runtime * 60, true)
        });
        
        var hash_timeline = Lampa.Utils.hash(object.movie.original_title + element.voice_name);
        var hash_behold = Lampa.Utils.hash(object.movie.original_title + element.voice_name);
        var data = {
          hash_timeline: hash_timeline,
          hash_behold: hash_behold
        };
        
        var info = [];
        if (object.movie.release_date && fully) {
          info.push(Lampa.Utils.parseTime(object.movie.release_date).full);
        }
        if (element.info) info.push(element.info);
        if (info.length) element.info = info.map(function(i) {
          return '<span>' + i + '</span>';
        }).join('<span class="online-prestige-split">●</span>');
        
        var html = Lampa.Template.get('online_prestige_full', element);
        var loader = html.find('.online-prestige__loader');
        var image = html.find('.online-prestige__img');

        if (choice.movie_view == hash_behold) scroll_to_element = html;

        var img = html.find('img')[0];
        img.onerror = function() {
          img.src = './img/img_broken.svg';
        };
        img.onload = function() {
          image.addClass('online-prestige__img--loaded');
          loader.remove();
        };
        img.src = Lampa.TMDB.image('t/p/w300' + object.movie.backdrop_path);
        images.push(img);

        html.find('.online-prestige__timeline').append(Lampa.Timeline.render(Lampa.Timeline.view(hash_timeline)));

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
          choice.movie_view = hash_behold;
          _this5.saveChoice(choice);
          _this5.watched({
            balanser: balanser,
            balanser_name: 'Kinogo',
            voice_id: choice.voice_id,
            voice_name: choice.voice_name || element.voice_name
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
          var timeline = Lampa.Timeline.view(hash_timeline);
          timeline.percent = 0;
          timeline.time = 0;
          timeline.duration = 0;
          Lampa.Timeline.update(timeline);
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

      if (scroll_to_element) {
        last = scroll_to_element[0];
      } else if (scroll_to_mark) {
        last = scroll_to_mark[0];
      }

      Lampa.Controller.enable('content');
    };

    this.contextMenu = function(params) {
      params.html.on('hover:long', function() {
        function show(extra) {
          var enabled = Lampa.Controller.enabled().name;
          var menu = [];

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
                Lampa.Utils.copyTextToClipboard(extra.file, function() {
                  Lampa.Noty.show(Lampa.Lang.translate('copy_secuses'));
                }, function() {
                  Lampa.Noty.show(Lampa.Lang.translate('copy_error'));
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
      this.reset();
      var html = Lampa.Template.get('online_does_not_answer', {
        balanser: balanser
      });
      scroll.append(html);
      this.loading(false);
    };

    this.getLastEpisode = function(items) {
      return 0;
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
    window.online_kinogo = true;
    var manifest = {
      type: 'video',
      version: '1.0.3',
      name: 'Онлайн - Kinogo',
      description: 'Плагин для просмотра онлайн сериалов и фильмов с Kinogo.ec',
      component: 'online_kinogo',
      onContextMenu: function onContextMenu(object) {
        return {
          name: Lampa.Lang.translate('online_watch'),
          description: 'Kinogo'
        };
      },
      onContextLauch: function onContextLauch(object) {
        resetTemplates();
        Lampa.Component.add('online_kinogo', component);
        Lampa.Activity.push({
          url: '',
          title: Lampa.Lang.translate('title_online'),
          component: 'online_kinogo',
          search: object.title,
          search_one: object.title,
          search_two: object.original_title,
          movie: object,
          page: 1
        });
      }
    };
    
    Lampa.Manifest.plugins = manifest;
    
    // Добавляем переводы
    var translations = {
      online_balanser_dont_work: {
        ru: 'Ничего не найдено на Kinogo',
        uk: 'Нічого не знайдено на Kinogo',
        en: 'Nothing found on Kinogo',
        zh: '在 Kinogo 上找不到任何内容'
      },
      online_watch: {
        ru: 'Смотреть онлайн',
        en: 'Watch online', 
        ua: 'Дивитися онлайн',
        zh: '在线观看'
      },
      title_online: {
        ru: 'Онлайн',
        uk: 'Онлайн',
        en: 'Online',
        zh: '在线的'
      },
      online_nolink: {
        ru: 'Не удалось извлечь ссылку',
        uk: 'Неможливо отримати посилання',
        en: 'Failed to fetch link',
        zh: '获取链接失败'
      },
      torrent_parser_reset: {
        ru: 'Сбросить',
        uk: 'Скинути',
        en: 'Reset',
        zh: '重置'
      },
      torrent_parser_voice: {
        ru: 'Озвучка',
        uk: 'Озвучення',
        en: 'Voice',
        zh: '配音'
      },
      torrent_serial_season: {
        ru: 'Сезон',
        uk: 'Сезон',
        en: 'Season',
        zh: '季节'
      },
      title_filter: {
        ru: 'Фильтр',
        uk: 'Фільтр',
        en: 'Filter',
        zh: '筛选'
      },
      player_lauch: {
        ru: 'Запустить в',
        uk: 'Запустити в',
        en: 'Launch in',
        zh: '启动在'
      },
      online_video: {
        ru: 'Видео',
        en: 'Video',
        ua: 'Відео',
        zh: '视频'
      },
      torrent_parser_label_title: {
        ru: 'Отметить просмотренным',
        uk: 'Позначити переглянутим',
        en: 'Mark as watched',
        zh: '标记为已观看'
      },
      torrent_parser_label_cancel_title: {
        ru: 'Снять отметку',
        uk: 'Зняти позначку',
        en: 'Remove mark',
        zh: '移除标记'
      },
      time_reset: {
        ru: 'Сбросить время',
        uk: 'Скинути час',
        en: 'Reset time',
        zh: '重置时间'
      },
      copy_link: {
        ru: 'Скопировать ссылку',
        uk: 'Скопіювати посилання',
        en: 'Copy link',
        zh: '复制链接'
      },
      title_action: {
        ru: 'Действия',
        uk: 'Дії',
        en: 'Actions',
        zh: '操作'
      },
      copy_secuses: {
        ru: 'Скопировано',
        uk: 'Скопійовано',
        en: 'Copied',
        zh: '已复制'
      },
      copy_error: {
        ru: 'Ошибка копирования',
        uk: 'Помилка копіювання',
        en: 'Copy error',
        zh: '复制错误'
      },
      helper_online_file: {
        ru: 'Удерживайте клавишу "ОК" для вызова контекстного меню',
        uk: 'Утримуйте клавішу "ОК" для виклику контекстного меню',
        en: 'Hold the "OK" key to bring up the context menu',
        zh: '按住"确定"键调出上下文菜单'
      },
      empty_title_two: {
        ru: 'Ничего не найдено',
        uk: 'Нічого не знайдено',
        en: 'Nothing found',
        zh: '没有找到任何内容'
      },
      settings_rest_source: {
        ru: 'Источник',
        uk: 'Джерело',
        en: 'Source',
        zh: '源'
      }
    };
    
    for (var key in translations) {
      if (!Lampa.Lang.translate(key)) {
        Lampa.Lang.add({[key]: translations[key]});
      }
    }

    // Добавляем CSS
    Lampa.Template.add('online_prestige_css', `
        <style>
        .online-prestige{position:relative;border-radius:.3em;background-color:rgba(0,0,0,0.3);display:flex;will-change:transform}
        .online-prestige__body{padding:1.2em;line-height:1.3;flex-grow:1;position:relative}
        .online-prestige__img{position:relative;width:13em;flex-shrink:0;min-height:8.2em}
        .online-prestige__img>img{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;border-radius:.3em;opacity:0;transition:opacity .3s}
        .online-prestige__img--loaded>img{opacity:1}
        .online-prestige__folder{padding:1em;flex-shrink:0}
        .online-prestige__viewed{position:absolute;top:1em;left:1em;background:rgba(0,0,0,0.45);border-radius:100%;padding:.25em;font-size:.76em}
        .online-prestige__episode-number{position:absolute;top:0;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;font-size:2em}
        .online-prestige__loader{position:absolute;top:50%;left:50%;width:2em;height:2em;margin-left:-1em;margin-top:-1em;background:url(./img/loader.svg) no-repeat center center;background-size:contain}
        .online-prestige__head,.online-prestige__footer{display:flex;justify-content:space-between;align-items:center}
        .online-prestige__timeline{margin:.8em 0}
        .online-prestige__title{font-size:1.7em;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:1;line-clamp:1;-webkit-box-orient:vertical}
        .online-prestige__time{padding-left:2em}
        .online-prestige__info{display:flex;align-items:center}
        .online-prestige__info>*{overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:1;line-clamp:1;-webkit-box-orient:vertical}
        .online-prestige__quality{padding-left:1em;white-space:nowrap}
        .online-prestige .online-prestige-split{font-size:.8em;margin:0 1em;flex-shrink:0}
        .online-prestige.focus::after{content:'';position:absolute;top:-0.6em;left:-0.6em;right:-0.6em;bottom:-0.6em;border-radius:.7em;border:solid .3em #fff;z-index:-1;pointer-events:none}
        .online-prestige+.online-prestige{margin-top:1.5em}
        .online-prestige--folder .online-prestige__footer{margin-top:.8em}
        .online-prestige-rate{display:inline-flex;align-items:center}
        .online-prestige-rate>span{font-weight:600;font-size:1.1em;padding-left:.7em}
        .online-empty{line-height:1.4}
        .online-empty__title{font-size:2em;margin-bottom:.9em}
        .online-empty__buttons{display:flex}
        .online-empty__buttons>*+*{margin-left:1em}
        .online-empty__button{background:rgba(0,0,0,0.3);font-size:1.2em;padding:.5em 1.2em;border-radius:.2em;margin-bottom:2.4em}
        .online-empty__button.focus{background:#fff;color:black}
        .online-empty__templates .online-empty-template:nth-child(2){opacity:.5}
        .online-empty__templates .online-empty-template:nth-child(3){opacity:.2}
        .online-empty-template{background-color:rgba(255,255,255,0.3);padding:1em;display:flex;align-items:center;border-radius:.3em}
        .online-empty-template>*{background:rgba(0,0,0,0.3);border-radius:.3em}
        .online-empty-template__ico{width:4em;height:4em;margin-right:2.4em}
        .online-empty-template__body{height:1.7em;width:70%}
        .online-empty-template+.online-empty-template{margin-top:1em}
        </style>
    `);
    $('body').append(Lampa.Template.get('online_prestige_css', {}, true));

    function resetTemplates() {
      // Добавляем все необходимые шаблоны
      Lampa.Template.add('online_prestige_full', `
        <div class="online-prestige online-prestige--full selector">
          <div class="online-prestige__img">
            <img alt="">
            <div class="online-prestige__loader"></div>
          </div>
          <div class="online-prestige__body">
            <div class="online-prestige__head">
              <div class="online-prestige__title">{title}</div>
              <div class="online-prestige__time">{time}</div>
            </div>
            <div class="online-prestige__timeline"></div>
            <div class="online-prestige__footer">
              <div class="online-prestige__info">{info}</div>
              <div class="online-prestige__quality">{quality}</div>
            </div>
          </div>
        </div>
      `);

      Lampa.Template.add('online_does_not_answer', `
        <div class="online-empty">
          <div class="online-empty__title">
            #{online_balanser_dont_work}
          </div>
          <div class="online-empty__templates">
            <div class="online-empty-template">
              <div class="online-empty-template__ico"></div>
              <div class="online-empty-template__body"></div>
            </div>
            <div class="online-empty-template">
              <div class="online-empty-template__ico"></div>
              <div class="online-empty-template__body"></div>
            </div>
            <div class="online-empty-template">
              <div class="online-empty-template__ico"></div>
              <div class="online-empty-template__body"></div>
            </div>
          </div>
        </div>
      `);

      Lampa.Template.add('online_prestige_rate', `
        <div class="online-prestige-rate">
          <svg width="17" height="16" viewBox="0 0 17 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M8.39409 0.192139L10.99 5.30994L16.7882 6.20387L12.5475 10.4277L13.5819 15.9311L8.39409 13.2425L3.20626 15.9311L4.24065 10.4277L0 6.20387L5.79819 5.30994L8.39409 0.192139Z" fill="#fff"></path>
          </svg>
          <span>{rate}</span>
        </div>
      `);

      Lampa.Template.add('online_prestige_folder', `
        <div class="online-prestige online-prestige--folder selector">
          <div class="online-prestige__folder">
            <svg viewBox="0 0 128 112" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect y="20" width="128" height="92" rx="13" fill="white"></rect>
              <path d="M29.9963 8H98.0037C96.0446 3.3021 91.4079 0 86 0H42C36.5921 0 31.9555 3.3021 29.9963 8Z" fill="white" fill-opacity="0.23"></path>
              <rect x="11" y="8" width="106" height="76" rx="13" fill="white" fill-opacity="0.51"></rect>
            </svg>
          </div>
          <div class="online-prestige__body">
            <div class="online-prestige__head">
              <div class="online-prestige__title">{title}</div>
              <div class="online-prestige__time">{time}</div>
            </div>
            <div class="online-prestige__footer">
              <div class="online-prestige__info">{info}</div>
            </div>
          </div>
        </div>
      `);

      Lampa.Template.add('icon_viewed', `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M21 7L9 19L3.5 13.5L4.91 12.09L9 16.17L19.59 5.59L21 7Z" fill="currentColor"/>
        </svg>
      `);
    }

    var button = `<div class="full-start__button selector view--online" data-subtitle="Kinogo v${manifest.version}">
      <svg width="135" height="147" viewBox="0 0 135 147" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M121.5 96.8823C139.5 86.49 139.5 60.5092 121.5 50.1169L41.25 3.78454C23.25 -6.60776 0.750004 6.38265 0.750001 27.1673L0.75 51.9742C4.70314 35.7475 23.6209 26.8138 39.0547 35.7701L94.8534 68.1505C110.252 77.0864 111.909 97.8693 99.8725 109.369L121.5 96.8823Z" fill="currentColor"/>
        <path d="M63 84.9836C80.3333 94.991 80.3333 120.01 63 130.017L39.75 143.44C22.4167 153.448 0.749999 140.938 0.75 120.924L0.750001 94.0769C0.750002 74.0621 22.4167 61.5528 39.75 71.5602L63 84.9836Z" fill="currentColor"/>
      </svg>
      <span>#{title_online}</span>
    </div>`;

    // Инициализация компонента
    Lampa.Component.add('online_kinogo', component);
    resetTemplates();
    
    // Добавляем кнопку в интерфейс
    Lampa.Listener.follow('full', function(e) {
      if (e.type == 'complite') {
        var btn = $(Lampa.Lang.translate(button));
        btn.on('hover:enter', function() {
          resetTemplates();
          Lampa.Component.add('online_kinogo', component);
          Lampa.Activity.push({
            url: '',
            title: Lampa.Lang.translate('title_online'),
            component: 'online_kinogo',
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

    if (Lampa.Manifest.app_digital >= 177) {
      Lampa.Storage.sync('online_choice_kinogo', 'object_object');
    }
  }

  if (!window.online_kinogo && Lampa.Manifest.app_digital >= 155) startPlugin();

})();
// V3.4
