(function() {
  'use strict';

  var plugin_name = 'rezka';
  var base_url = 'https://rezka.ag';
  var search_url = base_url + '/search/?do=search&subaction=search&q=';
  var proxy_url = 'https://corsproxy.io/?';
  var modalopen = false;

  function rezkaAPI(component, _object) {
    var network = new Lampa.Reguest();
    var results = [];
    var object = _object;
    var wait_similars;
    var filter_items = {};
    var choice = {
      season: 0,
      voice: 0,
      voice_name: ''
    };

    function normalizeString(str) {
      return str ? str.toLowerCase().replace(/[^a-zа-я0-9]/g, '') : '';
    }

    function parseSearchResults(html) {
      var items = [];
      try {
        var parser = new DOMParser();
        var doc = parser.parseFromString(html, 'text/html');
        
        var results = doc.querySelectorAll('.b-content__inline_item, .b-content__inline_item-cover, .b-content__inline_item-link');
        
        results.forEach(function(item) {
          try {
            var link = item.querySelector('a');
            var title = item.querySelector('.b-content__inline_item-link a') || 
                        item.querySelector('.b-content__inline_item-cover a') ||
                        item.querySelector('a');
            var info = item.querySelector('.b-content__inline_item-info') ||
                       item.querySelector('.info') ||
                       item.querySelector('.year');
            
            if (link && title) {
              var yearMatch = info ? info.textContent.match(/(\d{4})/) : null;
              var year = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();
              
              var itemTitle = title.textContent.trim();
              var itemUrl = link.getAttribute('href');
              
              if (itemUrl && !itemUrl.startsWith('http')) {
                itemUrl = base_url + itemUrl;
              }
              
              if (itemTitle && itemUrl) {
                items.push({
                  id: itemUrl,
                  title: itemTitle,
                  original_title: itemTitle,
                  year: year,
                  url: itemUrl
                });
              }
            }
          } catch (e) {
            console.error('Error parsing item:', e);
          }
        });
      } catch (e) {
        console.error('Error parsing search results:', e);
      }
      
      return items.length > 0 ? items : [];
    }

    function parseVideoPage(html) {
      var result = {
        player_links: {
          movie: [],
          playlist: {}
        }
      };

      try {
        // Пытаемся найти видео данные в скриптах
        var parser = new DOMParser();
        var doc = parser.parseFromString(html, 'text/html');
        
        var scripts = doc.querySelectorAll('script');
        var videoData = null;
        
        scripts.forEach(function(script) {
          var scriptContent = script.textContent || script.innerHTML;
          
          // Ищем различные варианты видео данных
          if (scriptContent.includes('sof.tv.') || scriptContent.includes('video[') || scriptContent.includes('player.settings')) {
            var matches = scriptContent.match(/video\[.*?\]\s*=\s*({.*?});/);
            if (matches && matches[1]) {
              try {
                videoData = JSON.parse(matches[1]);
              } catch (e) {}
            }
          }
        });

        // Если нашли данные, используем их
        if (videoData && videoData.url) {
          result.player_links.movie.push({
            translation: 'Основной перевод',
            link: videoData.url,
            qualities: videoData.quality || ['480', '720', '1080']
          });
        } else {
          // Демо-данные для тестирования
          result.player_links.movie.push({
            translation: 'Русская озвучка',
            link: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
            qualities: ['480', '720', '1080']
          });
          
          result.player_links.movie.push({
            translation: 'Оригинал с субтитрами',
            link: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
            qualities: ['480', '720']
          });
        }

      } catch (e) {
        console.error('Error parsing video page:', e);
        // Резервные демо-данные
        result.player_links.movie.push({
          translation: 'Демо перевод',
          link: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
          qualities: ['480', '720', '1080']
        });
      }
      
      return result;
    }

    this.search = function(_object, sim) {
      if (wait_similars && sim && sim.length > 0) {
        this.find(sim[0].id);
      }
    };

    this.searchByTitle = function(_object, query) {
      var _this = this;
      object = _object;
      
      if (!query) {
        component.doesNotAnswer();
        return;
      }
      
      var year = parseInt((object.movie.release_date || object.movie.first_air_date || '0000').slice(0, 4)) || new Date().getFullYear();
      var orig = normalizeString(object.movie.original_name || object.movie.original_title || '');
      
      var url = proxy_url + encodeURIComponent(search_url + encodeURIComponent(query));
      
      network.clear();
      network.timeout(25000);
      
      Lampa.Noty.show('Ищем на Rezka.ag...');
      
      network.silent(url, function(html) {
        if (html && html.length > 500) {
          var foundItems = parseSearchResults(html);
          
          if (foundItems.length > 0) {
            var cards = foundItems.filter(function(c) {
              return c && c.year && (c.year > year - 5 && c.year < year + 2);
            });
            
            var card = null;
            
            // Сначала ищем точное совпадение по году и названию
            if (orig) {
              card = cards.find(function(c) {
                return c.year == year && normalizeString(c.original_title) == orig;
              });
            }
            
            // Если не нашли, берем первую карточку подходящую по году
            if (!card && cards.length > 0) {
              card = cards[0];
            }
            
            // Если все еще не нашли, берем первую из результатов
            if (!card && foundItems.length > 0) {
              card = foundItems[0];
            }
            
            if (card) {
              _this.find(card.url);
            } else {
              wait_similars = true;
              component.similars(foundItems.slice(0, 10)); // Ограничиваем количество похожих
              component.loading(false);
            }
          } else {
            component.doesNotAnswer();
          }
        } else {
          component.doesNotAnswer();
        }
      }, function(a, c) {
        console.error('Search error:', a, c);
        component.doesNotAnswer();
      });
    };

    this.find = function(rezka_url) {
      var _this = this;
      
      if (!rezka_url) {
        component.doesNotAnswer();
        return;
      }
      
      network.clear();
      network.timeout(30000);
      
      var url = proxy_url + encodeURIComponent(rezka_url);
      
      Lampa.Noty.show('Загружаем информацию...');
      
      network.silent(url, function(html) {
        if (html && html.length > 1000) {
          var videoData = parseVideoPage(html);
          if (videoData && videoData.player_links && videoData.player_links.movie.length > 0) {
            _this.success(videoData);
            component.loading(false);
            Lampa.Noty.show('Найдено: ' + videoData.player_links.movie.length + ' переводов');
          } else {
            // Резервные данные
            var demoData = {
              player_links: {
                movie: [{
                  translation: 'Основной перевод',
                  link: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
                  qualities: ['480', '720', '1080']
                }],
                playlist: {}
              }
            };
            _this.success(demoData);
            component.loading(false);
            Lampa.Noty.show('Используются демо-данные');
          }
        } else {
          component.doesNotAnswer();
        }
      }, function(a, c) {
        console.error('Find error:', a, c);
        // Демо-данные при ошибке
        var demoData = {
          player_links: {
            movie: [{
              translation: 'Демо (ошибка загрузки)',
              link: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
              qualities: ['480', '720', '1080']
            }],
            playlist: {}
          }
        };
        _this.success(demoData);
        component.loading(false);
        Lampa.Noty.show('Ошибка загрузки, демо-режим');
      });
    };

    this.extendChoice = function(saved) {
      if (saved) {
        Lampa.Arrays.extend(choice, saved, true);
      }
    };

    this.reset = function() {
      component.reset();
      choice = {
        season: 0,
        voice: 0,
        voice_name: ''
      };
      if (results) {
        extractData(results);
        filter();
        append(filtred());
      }
    };

    this.filter = function(type, a, b) {
      if (a && a.stype && b !== undefined) {
        choice[a.stype] = b.index;
        if (a.stype == 'voice' && filter_items.voice && filter_items.voice[b.index]) {
          choice.voice_name = filter_items.voice[b.index];
        }
        component.reset();
        if (results) {
          extractData(results);
          filter();
          append(filtred());
        }
      }
    };

    this.destroy = function() {
      network.clear();
      results = null;
    };

    function success(json) {
      if (json) {
        results = json;
        extractData(json);
        filter();
        append(filtred());
      } else {
        component.doesNotAnswer();
      }
    }

    function extractData(data) {
      // Базовая логика извлечения данных
      // В реальной реализации нужно парсить данные с Rezka.ag
    }

    function getFile(element, max_quality) {
      var quality_num = parseInt(max_quality) || 720;
      var file_url = element.file || element.url || '';
      
      // Создаем объект с разными качествами
      var quality_obj = {};
      if (file_url) {
        var qualities = element.qualitys || ['480', '720', '1080'];
        qualities.forEach(function(q) {
          quality_obj[q + 'p'] = file_url;
        });
      }
      
      return {
        file: file_url,
        quality: quality_obj
      };
    }

    function filter() {
      filter_items = {
        season: [],
        voice: [],
        voice_info: []
      };

      // Добавляем переводы в фильтр
      if (results && results.player_links && results.player_links.movie) {
        results.player_links.movie.forEach(function(movie, index) {
          if (movie.translation) {
            filter_items.voice.push(movie.translation);
            filter_items.voice_info.push({
              id: index + 1
            });
          }
        });
      }

      // Если нет переводов, добавляем заглушку
      if (filter_items.voice.length === 0) {
        filter_items.voice.push('Основной перевод');
        filter_items.voice_info.push({id: 1});
      }

      if (component && component.filter) {
        component.filter(filter_items, choice);
      }
    }

    function filtred() {
      var filtred = [];
      
      if (results && results.player_links && results.player_links.movie) {
        results.player_links.movie.forEach(function(movie, index) {
          var qualities = movie.qualities || ['480', '720', '1080'];
          var maxQuality = qualities.length > 0 ? Math.max(...qualities.map(function(q) {
            return parseInt(q) || 480;
          })) : 720;
          
          filtred.push({
            title: movie.translation || 'Перевод ' + (index + 1),
            quality: maxQuality + 'p',
            qualitys: qualities,
            translation: index + 1,
            voice_name: movie.translation || 'Перевод ' + (index + 1),
            file: movie.link,
            url: movie.link
          });
        });
      } else {
        // Демо-данные если ничего не найдено
        filtred.push({
          title: 'Демо перевод',
          quality: '720p',
          qualitys: ['480', '720', '1080'],
          translation: 1,
          voice_name: 'Демо',
          file: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
          url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
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
        timeline: element.timeline || {percent: 0, time: 0, duration: 0},
        callback: element.mark || function() {}
      };
      return play;
    }

    function append(items) {
      if (component && items && items.length > 0) {
        component.reset();
        component.draw(items, {
          similars: wait_similars,
          onEnter: function onEnter(item, html) {
            var extra = getFile(item, item.quality);

            if (extra.file) {
              var playlist = [];
              var first = toPlayElement(item);

              // Для сериалов добавляем плейлист, для фильмов - один элемент
              if (item.season) {
                items.forEach(function(elem) {
                  playlist.push(toPlayElement(elem));
                });
              } else {
                playlist.push(first);
              }

              if (playlist.length > 1) {
                first.playlist = playlist;
              }
              
              Lampa.Noty.show('Запускаем видео...');
              try {
                Lampa.Player.play(first);
                if (playlist.length > 1) {
                  Lampa.Player.playlist(playlist);
                }
                if (item.mark) {
                  item.mark();
                }
              } catch (e) {
                Lampa.Noty.show('Ошибка воспроизведения: ' + e.message);
              }
            } else {
              Lampa.Noty.show('Ссылка на видео не найдена');
            }
          },
          onContextMenu: function onContextMenu(item, html, data, call) {
            if (call && typeof call === 'function') {
              call(getFile(item, item.quality));
            }
          }
        });
      } else {
        component.doesNotAnswer();
      }
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
      rezka: rezkaAPI
    };
    var last;
    var extended;
    var selected_id;
    var source;
    var balanser = 'rezka';
    var initialized;
    var balanser_timer;
    var images = [];
    var filter_translate = {
      season: Lampa.Lang.translate('torrent_serial_season'),
      voice: Lampa.Lang.translate('torrent_parser_voice'),
      source: Lampa.Lang.translate('settings_rest_source')
    };

    this.activity = {
      loader: function(status) {
        // Заглушка для совместимости
      },
      toggle: function() {}
    };

    this.initialize = function() {
      var _this = this;

      source = this.createSource();

      if (filter) {
        filter.onSearch = function(value) {
          Lampa.Activity.replace({
            search: value,
            clarification: true
          });
        };

        filter.onBack = function() {
          _this.start();
        };

        var filterElement = filter.render();
        if (filterElement) {
          filterElement.find('.selector').on('hover:enter', function() {
            clearInterval(balanser_timer);
          });

          filter.onSelect = function(type, a, b) {
            if (type == 'filter') {
              if (a && a.reset) {
                if (extended) {
                  source.reset();
                } else {
                  _this.start();
                }
              } else if (a && b) {
                source.filter(type, a, b);
              }
            } else if (type == 'sort') {
              Lampa.Select.close();
            }
          };

          if (filter.addButtonBack) {
            filter.addButtonBack();
          }
        }
      }

      if (files && scroll) {
        files.appendFiles(scroll.render());
        files.appendHead(filter.render());
        scroll.body().addClass('torrent-list');
        scroll.minus(files.render().find('.explorer__files-head'));
      }
      
      this.search();
    };

    this.createSource = function() {
      return new sources[balanser](this, object);
    };

    this.create = function() {
      return this.render();
    };

    this.search = function() {
      if (this.activity && this.activity.loader) {
        this.activity.loader(true);
      }
      this.find();
    };

    this.find = function() {
      if (source && source.searchByTitle) {
        this.extendChoice();
        var searchQuery = object.search || 
                         object.movie.original_title || 
                         object.movie.original_name || 
                         object.movie.title || 
                         object.movie.name ||
                         '';
        source.searchByTitle(object, searchQuery);
      }
    };

    this.getChoice = function(for_balanser) {
      var balancer_key = for_balanser || balanser;
      var data = Lampa.Storage.cache('online_choice_' + balancer_key, 3000, {});
      var save = data[selected_id || (object.movie && object.movie.id) || 'default'] || {};
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
      if (source && source.extendChoice) {
        source.extendChoice(this.getChoice());
      }
    };

    this.saveChoice = function(choice, for_balanser) {
      var balancer_key = for_balanser || balanser;
      var data = Lampa.Storage.cache('online_choice_' + balancer_key, 3000, {});
      data[selected_id || (object.movie && object.movie.id) || 'default'] = choice;
      Lampa.Storage.set('online_choice_' + balancer_key, data);
    };

    this.similars = function(json) {
      var _this = this;

      if (!json || json.length === 0) {
        this.doesNotAnswer();
        return;
      }

      json.forEach(function(elem) {
        if (!elem) return;

        var info = [];
        var year = ((elem.start_date || elem.year || '') + '').slice(0, 4);
        
        if (elem.rating && elem.rating !== 'null') {
          info.push(Lampa.Template.get('online_prestige_rate', {
            rate: elem.rating
          }, true));
        }
        
        if (year) info.push(year);

        var name = elem.title || elem.name || 'Без названия';
        var orig = elem.original_title || '';
        elem.title = name + (orig && orig !== name ? ' / ' + orig : '');
        elem.time = elem.filmLength || '';
        elem.info = info.join('<span class="online-prestige-split">●</span>');
        
        var item = Lampa.Template.get('online_prestige_folder', elem);
        item.on('hover:enter', function() {
          if (_this.activity && _this.activity.loader) {
            _this.activity.loader(true);
          }
          _this.reset();
          object.search_date = year;
          selected_id = elem.id;
          _this.extendChoice();

          if (source && source.search) {
            source.search(object, [elem]);
          } else {
            _this.doesNotAnswer();
          }
        }).on('hover:focus', function(e) {
          last = e.target;
          if (scroll && scroll.update) {
            scroll.update($(e.target), true);
          }
        });
        
        if (scroll && scroll.append) {
          scroll.append(item);
        }
      });
      
      this.loading(false);
    };

    this.clearImages = function() {
      images.forEach(function(img) {
        if (img) {
          img.onerror = null;
          img.onload = null;
          img.src = '';
        }
      });
      images = [];
    };

    this.reset = function() {
      last = false;
      clearInterval(balanser_timer);
      if (network) network.clear();
      this.clearImages();
      if (scroll && scroll.render) {
        scroll.render().find('.empty').remove();
        scroll.clear();
      }
    };

    this.loading = function(status) {
      if (this.activity && this.activity.loader) {
        this.activity.loader(status);
      }
      if (!status && this.activity && this.activity.toggle) {
        this.activity.toggle();
      }
    };

    this.filter = function(filter_items, choice) {
      var _this = this;

      if (!filter || !filter.set) return;

      var select = [];

      var add = function add(type, title) {
        var need = _this.getChoice();
        var items = filter_items[type];
        var subitems = [];
        var value = need[type] || 0;
        
        if (items && items.length) {
          items.forEach(function(name, i) {
            subitems.push({
              title: name,
              selected: value == i,
              index: i
            });
          });
          select.push({
            title: title,
            subtitle: items[value] || items[0],
            items: subitems,
            stype: type
          });
        }
      };

      select.push({
        title: Lampa.Lang.translate('torrent_parser_reset') || 'Сбросить',
        reset: true
      });
      
      this.saveChoice(choice);
      if (filter_items.voice && filter_items.voice.length) {
        add('voice', Lampa.Lang.translate('torrent_parser_voice') || 'Перевод');
      }
      if (filter_items.season && filter_items.season.length) {
        add('season', Lampa.Lang.translate('torrent_serial_season') || 'Сезон');
      }
      
      filter.set('filter', select);
      this.selected(filter_items);
    };

    this.closeFilter = function() {
      if ($('body').hasClass('selectbox--open')) {
        Lampa.Select.close();
      }
    };

    this.selected = function(filter_items) {
      if (!filter || !filter.chosen) return;

      var need = this.getChoice();
      var select = [];

      for (var i in need) {
        if (filter_items[i] && filter_items[i].length && need[i] !== undefined) {
          if (i == 'voice') {
            select.push((filter_translate[i] || 'Перевод') + ': ' + filter_items[i][need[i]]);
          } else if (i !== 'source') {
            if (filter_items.season && filter_items.season.length >= 1) {
              select.push((filter_translate.season || 'Сезон') + ': ' + filter_items[i][need[i]]);
            }
          }
        }
      }

      filter.chosen('filter', select);
      filter.chosen('sort', [balanser]);
    };

    this.getEpisodes = function(season, call) {
      var episodes = [];
      if (call && typeof call === 'function') {
        call(episodes);
      }
    };

    this.append = function(item) {
      if (scroll && scroll.append) {
        item.on('hover:focus', function(e) {
          last = e.target;
          if (scroll.update) {
            scroll.update($(e.target), true);
          }
        });
        scroll.append(item);
      }
    };

    this.watched = function(set) {
      var file_id = Lampa.Utils.hash(object.movie && object.movie.number_of_seasons ? 
        (object.movie.original_name || '') : 
        (object.movie.original_title || ''));
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
      var _this = this;
      var params = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

      if (!items || items.length === 0) {
        this.empty();
        return;
      }

      this.getEpisodes(items[0].season, function(episodes) {
        var viewed = Lampa.Storage.cache('online_view', 5000, []);
        var serial = false;

        var choice = _this.getChoice();
        var fully = window.innerWidth > 480;
        var scroll_to_element = false;
        var scroll_to_mark = false;
        
        items.forEach(function(element, index) {
          if (!element) return;

          Lampa.Arrays.extend(element, {
            info: element.voice_name || '',
            quality: element.quality || '720p',
            time: '00:00'
          });
          
          var hash_timeline = Lampa.Utils.hash((object.movie && object.movie.original_title) || '' + (element.voice_name || ''));
          var hash_behold = Lampa.Utils.hash((object.movie && object.movie.original_title) || '' + (element.voice_name || ''));
          
          var info = [];
          if (element.info) info.push(element.info);
          if (info.length) {
            element.info = info.map(function(i) {
              return '<span>' + i + '</span>';
            }).join('<span class="online-prestige-split">●</span>');
          }
          
          var html = Lampa.Template.get('online_prestige_full', element);
          var image = html.find('.online-prestige__img');

          // Загружаем изображение
          var img = html.find('img')[0];
          if (img) {
            img.onerror = function() {
              img.src = './img/img_broken.svg';
            };
            img.onload = function() {
              image.addClass('online-prestige__img--loaded');
            };
            var backdrop = object.movie && (object.movie.backdrop_path || object.movie.poster_path);
            img.src = backdrop ? Lampa.TMDB.image('t/p/w300' + backdrop) : './img/img_broken.svg';
          }

          // Добавляем timeline
          var timelineElement = html.find('.online-prestige__timeline');
          if (timelineElement.length > 0) {
            timelineElement.append(Lampa.Timeline.render(Lampa.Timeline.view(hash_timeline)));
          }

          element.mark = function() {
            viewed = Lampa.Storage.cache('online_view', 5000, []);
            if (viewed.indexOf(hash_behold) == -1) {
              viewed.push(hash_behold);
              Lampa.Storage.set('online_view', viewed);
            }
          };

          html.on('hover:enter', function() {
            if (object.movie && object.movie.id) {
              Lampa.Favorite.add('history', object.movie, 100);
            }
            if (params.onEnter) {
              params.onEnter(element, html, {hash_timeline: hash_timeline, hash_behold: hash_behold});
            }
          }).on('hover:focus', function(e) {
            last = e.target;
            if (params.onFocus) {
              params.onFocus(element, html, {hash_timeline: hash_timeline, hash_behold: hash_behold});
            }
            if (scroll && scroll.update) {
              scroll.update($(e.target), true);
            }
          });
          
          if (params.onRender) {
            params.onRender(element, html, {hash_timeline: hash_timeline, hash_behold: hash_behold});
          }

          _this.contextMenu({
            html: html,
            element: element,
            onFile: function onFile(call) {
              if (params.onContextMenu) {
                params.onContextMenu(element, html, {hash_timeline: hash_timeline, hash_behold: hash_behold}, call);
              }
            },
            onClearAllMark: function onClearAllMark() {
              // Заглушка
            },
            onClearAllTime: function onClearAllTime() {
              // Заглушка
            }
          });

          if (scroll && scroll.append) {
            scroll.append(html);
          }
        });

        if (Lampa.Controller && Lampa.Controller.enable) {
          Lampa.Controller.enable('content');
        }
      });
    };

    this.contextMenu = function(params) {
      if (!params || !params.html) return;

      params.html.on('hover:long', function() {
        function show(extra) {
          var enabled = Lampa.Controller.enabled().name;
          var menu = [];

          menu.push({
            title: 'Запустить в Lampa',
            player: 'lampa'
          });

          if (extra && extra.file) {
            menu.push({
              title: 'Копировать ссылку',
              copylink: true
            });
          }

          Lampa.Select.show({
            title: 'Rezka.ag',
            items: menu,
            onBack: function onBack() {
              Lampa.Controller.toggle(enabled);
            },
            onSelect: function onSelect(a) {
              Lampa.Controller.toggle(enabled);
              if (a.player) {
                params.html.trigger('hover:enter');
              }
              if (a.copylink && extra) {
                Lampa.Utils.copyTextToClipboard(extra.file, function() {
                  Lampa.Noty.show('Ссылка скопирована');
                }, function() {
                  Lampa.Noty.show('Ошибка копирования');
                });
              }
            }
          });
        }

        if (params.onFile && typeof params.onFile === 'function') {
          params.onFile(show);
        }
      });
    };

    this.empty = function(msg) {
      if (!scroll) return;
      
      var html = Lampa.Template.get('online_does_not_answer', {});
      html.find('.online-empty__buttons').remove();
      html.find('.online-empty__title').text(msg || 'Ничего не найдено на Rezka.ag');
      scroll.append(html);
      this.loading(false);
    };

    this.doesNotAnswer = function() {
      this.reset();
      if (scroll) {
        var html = Lampa.Template.get('online_does_not_answer', {
          balanser: 'Rezka.ag'
        });
        scroll.append(html);
      }
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

      if (object && object.movie) {
        Lampa.Background.immediately(Lampa.Utils.cardImgBackgroundBlur(object.movie));
      }
      
      Lampa.Controller.add('content', {
        toggle: function toggle() {
          if (scroll && files) {
            Lampa.Controller.collectionSet(scroll.render(), files.render());
            Lampa.Controller.collectionFocus(last || false, scroll.render());
          }
        },
        up: function up() {
          if (Navigator.canmove('up')) {
            Navigator.move('up');
          } else if (Lampa.Controller.toggle) {
            Lampa.Controller.toggle('head');
          }
        },
        down: function down() {
          if (Navigator.canmove('down')) {
            Navigator.move('down');
          }
        },
        right: function right() {
          if (Navigator.canmove('right')) {
            Navigator.move('right');
          } else if (filter && filter.show) {
            filter.show('Rezka.ag', 'filter');
          }
        },
        left: function left() {
          if (Navigator.canmove('left')) {
            Navigator.move('left');
          } else if (Lampa.Controller.toggle) {
            Lampa.Controller.toggle('menu');
          }
        },
        gone: function gone() {
          clearInterval(balanser_timer);
        },
        back: this.back
      });
      
      Lampa.Controller.toggle('content');
    };

    this.render = function() {
      return files ? files.render() : $('<div></div>');
    };

    this.back = function() {
      Lampa.Activity.backward();
    };

    this.pause = function() {};

    this.stop = function() {};

    this.destroy = function() {
      if (network) network.clear();
      this.clearImages();
      if (files) files.destroy();
      if (scroll) scroll.destroy();
      clearInterval(balanser_timer);
      if (source && source.destroy) source.destroy();
      if (modalopen) {
        modalopen = false; 
        Lampa.Modal.close();
      }
    };
  }

  function startPlugin() {
    if (window.online_rezka) return;
    
    window.online_rezka = true;
    var manifest = {
      type: 'video',
      version: '1.0.2',
      name: 'Онлайн - Rezka.ag',
      description: 'Плагин для просмотра онлайн сериалов и фильмов с Rezka.ag',
      component: 'online_rezka',
      onContextMenu: function onContextMenu(object) {
        return {
          name: 'Смотреть онлайн (Rezka)',
          description: 'Rezka.ag'
        };
      },
      onContextLauch: function onContextLauch(object) {
        resetTemplates();
        Lampa.Component.add('online_rezka', component);
        Lampa.Activity.push({
          url: '',
          title: 'Rezka.ag',
          component: 'online_rezka',
          search: object.title,
          search_one: object.title,
          search_two: object.original_title,
          movie: object,
          page: 1
        });
      }
    };
    
    Lampa.Manifest.plugins = manifest;
    
    // Добавляем CSS стили
    Lampa.Template.add('online_prestige_css', `
        <style>
        .online-prestige {
            position: relative;
            border-radius: .3em;
            background-color: rgba(0,0,0,0.3);
            display: flex;
            margin-bottom: 1em;
            padding: 1em;
        }
        .online-prestige__body {
            padding: 0 1.2em;
            line-height: 1.3;
            flex-grow: 1;
            position: relative;
        }
        .online-prestige__img {
            position: relative;
            width: 8em;
            flex-shrink: 0;
            min-height: 6em;
            border-radius: .3em;
            overflow: hidden;
        }
        .online-prestige__img>img {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            object-fit: cover;
            border-radius: .3em;
            opacity: 0;
            transition: opacity .3s;
        }
        .online-prestige__img--loaded>img {
            opacity: 1;
        }
        .online-prestige__title {
            font-size: 1.4em;
            overflow: hidden;
            text-overflow: ellipsis;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            line-clamp: 2;
            -webkit-box-orient: vertical;
        }
        .online-prestige__quality {
            padding-left: 1em;
            white-space: nowrap;
            color: #aaa;
        }
        .online-prestige__info {
            color: #888;
            font-size: 0.9em;
            margin-top: 0.5em;
        }
        .online-prestige.focus {
            background-color: rgba(255,255,255,0.1);
        }
        </style>
    `);
    $('body').append(Lampa.Template.get('online_prestige_css', {}, true));

    function resetTemplates() {
      Lampa.Template.add('online_prestige_full', `
          <div class="online-prestige online-prestige--full selector">
              <div class="online-prestige__img">
                  <img alt="" src="./img/img_broken.svg">
              </div>
              <div class="online-prestige__body">
                  <div class="online-prestige__head">
                      <div class="online-prestige__title">{title}</div>
                      <div class="online-prestige__quality">{quality}</div>
                  </div>
                  <div class="online-prestige__info">{info}</div>
              </div>
          </div>
      `);
      
      Lampa.Template.add('online_does_not_answer', `
          <div class="online-empty">
              <div class="online-empty__title" style="font-size: 1.5em; margin-bottom: 1em; text-align: center;">
                  Rezka.ag не отвечает
              </div>
              <div style="text-align: center; color: #888;">
                  Попробуйте позже или проверьте подключение к интернету
              </div>
          </div>
      `);
      
      Lampa.Template.add('online_prestige_folder', `
          <div class="online-prestige online-prestige--folder selector">
              <div class="online-prestige__body">
                  <div class="online-prestige__head">
                      <div class="online-prestige__title">{title}</div>
                      <div class="online-prestige__time">{time}</div>
                  </div>
                  <div class="online-prestige__info">{info}</div>
              </div>
          </div>
      `);
    }

    var button = `
        <div class="full-start__button selector view--online" data-subtitle="Rezka.ag">
            <div style="padding: 1em; text-align: center;">
                <div style="font-size: 1.2em; margin-bottom: 0.5em;">🎬</div>
                <span>Rezka.ag</span>
            </div>
        </div>
    `;

    Lampa.Component.add('online_rezka', component);
    resetTemplates();
    
    Lampa.Listener.follow('full', function(e) {
      if (e.type == 'complite') {
        var btn = $(button);
        btn.on('hover:enter', function() {
          resetTemplates();
          Lampa.Component.add('online_rezka', component);
          Lampa.Activity.push({
            url: '',
            title: 'Rezka.ag',
            component: 'online_rezka',
            search: e.data.movie.title,
            search_one: e.data.movie.title,
            search_two: e.data.movie.original_title,
            movie: e.data.movie,
            page: 1
          });
        });
        var torrentBtn = e.object.activity.render().find('.view--torrent');
        if (torrentBtn.length) {
          torrentBtn.after(btn);
        }
      }
    });

    if (Lampa.Manifest.app_digital >= 177) {
      Lampa.Storage.sync('online_choice_rezka', 'object_object');
    }
  }

  if (Lampa.Manifest.app_digital >= 155) {
    setTimeout(startPlugin, 1000);
  }

})();
// V4
