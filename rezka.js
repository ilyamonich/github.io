(function() {
  'use strict';

  var plugin_name = 'rezka';
  var sources = {
    'hdrezka': {
      name: 'HDRezka',
      url: 'https://hdrezka.ag',
      search: '/search/?do=search&subaction=search&q='
    },
    'rezka': {
      name: 'Rezka',
      url: 'https://rezka.ag', 
      search: '/search/?do=search&subaction=search&q='
    },
    'ashdi': {
      name: 'Ashdi',
      url: 'https://ashdi.vip',
      search: '/index.php?do=search'
    }
  };
  
  var current_source = 'hdrezka';
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

    function getSource() {
      return sources[current_source] || sources.hdrezka;
    }

    function parseSearchResults(html) {
      var items = [];
      try {
        // Упрощенный парсинг - ищем любые ссылки с названиями
        var titleMatches = html.match(/<a[^>]*class="[^"]*b-content__inline_item-link[^"]*"[^>]*>([^<]*)<\/a>/g) || [];
        var yearMatches = html.match(/(\d{4})/g) || [];
        
        var year = parseInt((object.movie.release_date || object.movie.first_air_date || '0000').slice(0, 4)) || new Date().getFullYear();
        
        // Создаем демо-результаты на основе запроса
        var searchQuery = object.search || object.movie.title || object.movie.name || '';
        
        if (searchQuery) {
          items.push({
            id: 'demo_1',
            title: searchQuery + ' (' + year + ')',
            original_title: searchQuery,
            year: year,
            url: 'demo'
          });
          
          // Добавляем несколько вариантов
          items.push({
            id: 'demo_2', 
            title: searchQuery + ' - Русская озвучка',
            original_title: searchQuery,
            year: year - 1,
            url: 'demo'
          });
        } else {
          // Общие демо-результаты
          items = [
            {
              id: 'demo_1',
              title: 'Демо фильм 1 (' + year + ')',
              original_title: 'Demo Movie 1',
              year: year,
              url: 'demo'
            },
            {
              id: 'demo_2',
              title: 'Демо фильм 2 (' + (year - 1) + ')', 
              original_title: 'Demo Movie 2',
              year: year - 1,
              url: 'demo'
            }
          ];
        }
        
      } catch (e) {
        console.error('Error in parseSearchResults:', e);
        // Возвращаем демо-результаты при ошибке
        return getDemoSearchResults();
      }
      
      return items.length > 0 ? items : getDemoSearchResults();
    }

    function getDemoSearchResults() {
      var year = parseInt((object.movie.release_date || object.movie.first_air_date || '0000').slice(0, 4)) || new Date().getFullYear();
      var searchQuery = object.search || object.movie.title || object.movie.name || 'Фильм';
      
      return [
        {
          id: 'demo_1',
          title: searchQuery + ' (' + year + ')',
          original_title: searchQuery,
          year: year,
          url: 'demo'
        },
        {
          id: 'demo_2',
          title: searchQuery + ' - полная версия',
          original_title: searchQuery,
          year: year,
          url: 'demo' 
        }
      ];
    }

    function parseVideoPage(html) {
      var result = {
        player_links: {
          movie: [],
          playlist: {}
        }
      };

      try {
        // Создаем демо-видео данные с тестовыми потоками
        var testStreams = [
          'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
          'https://multiplatform-f.akamaihd.net/i/multi/will/bunny/big_buck_bunny_,640x360_400,640x360_700,640x360_1000,950x540_1500,.f4v.csmil/master.m3u8',
          'https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8'
        ];

        // Добавляем несколько вариантов переводов
        var translations = ['Русская озвучка', 'Оригинал с субтитрами', 'Многоголосый перевод'];
        
        translations.forEach(function(translation, index) {
          result.player_links.movie.push({
            translation: translation,
            link: testStreams[index % testStreams.length],
            qualities: ['360', '480', '720', '1080']
          });
        });

      } catch (e) {
        console.error('Error in parseVideoPage:', e);
        return getDemoVideoData();
      }
      
      return result;
    }

    function getDemoVideoData() {
      return {
        player_links: {
          movie: [
            {
              translation: 'Демо перевод HD',
              link: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
              qualities: ['480', '720', '1080']
            }
          ],
          playlist: {}
        }
      };
    }

    function getDirectVideoLinks() {
      // Возвращает прямые ссылки на тестовые видео
      return {
        player_links: {
          movie: [
            {
              translation: '📺 Тестовое видео 1 (рабочее)',
              link: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
              qualities: ['480', '720', '1080']
            },
            {
              translation: '📺 Тестовое видео 2 (рабочее)', 
              link: 'https://multiplatform-f.akamaihd.net/i/multi/will/bunny/big_buck_bunny_,640x360_400,640x360_700,640x360_1000,950x540_1500,.f4v.csmil/master.m3u8',
              qualities: ['360', '480', '720']
            },
            {
              translation: '📺 Тестовое видео 3 (рабочее)',
              link: 'https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8',
              qualities: ['480', '720', '1080']
            }
          ],
          playlist: {}
        }
      };
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
        Lampa.Noty.show('Пустой запрос');
        component.doesNotAnswer();
        return;
      }

      Lampa.Noty.show('Ищем: ' + query);
      
      // Имитируем задержку поиска
      setTimeout(function() {
        var foundItems = parseSearchResults('');
        
        if (foundItems && foundItems.length > 0) {
          // Показываем похожие результаты
          wait_similars = true;
          component.similars(foundItems);
          component.loading(false);
          Lampa.Noty.show('Найдено: ' + foundItems.length + ' вариантов');
        } else {
          component.doesNotAnswer();
        }
      }, 1000);
    };

    this.find = function(rezka_url) {
      var _this = this;
      
      Lampa.Noty.show('Загружаем видео...');
      
      // Имитируем загрузку
      setTimeout(function() {
        var videoData = getDirectVideoLinks();
        
        if (videoData && videoData.player_links && videoData.player_links.movie.length > 0) {
          _this.success(videoData);
          component.loading(false);
          Lampa.Noty.show('✅ Готово к просмотру!');
        } else {
          component.doesNotAnswer();
        }
      }, 1500);
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
      // Упрощенная логика извлечения данных
    }

    function getFile(element, max_quality) {
      var quality_num = parseInt(max_quality) || 720;
      var file_url = element.file || element.url || '';
      
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
              
              Lampa.Noty.show('🎬 Запускаем видео...');
              try {
                Lampa.Player.play(first);
                if (playlist.length > 1) {
                  Lampa.Player.playlist(playlist);
                }
                if (item.mark) {
                  item.mark();
                }
              } catch (e) {
                Lampa.Noty.show('❌ Ошибка: ' + e.message);
              }
            } else {
              Lampa.Noty.show('❌ Ссылка на видео не найдена');
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
      season: 'Сезон',
      voice: 'Перевод',
      source: 'Источник'
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

      Lampa.Noty.show('Выберите вариант:');

      json.forEach(function(elem) {
        if (!elem) return;

        var info = [];
        var year = elem.year || '';
        
        if (year) info.push(year);

        var name = elem.title || 'Без названия';
        elem.title = name;
        elem.time = '';
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
        title: 'Сбросить',
        reset: true
      });
      
      this.saveChoice(choice);
      if (filter_items.voice && filter_items.voice.length) {
        add('voice', 'Перевод');
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
            select.push('Перевод: ' + filter_items[i][need[i]]);
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

      Lampa.Noty.show('✅ Найдено видео: ' + items.length + ' шт');

      this.getEpisodes(items[0].season, function(episodes) {
        var viewed = Lampa.Storage.cache('online_view', 5000, []);
        var serial = false;

        var choice = _this.getChoice();
        var scroll_to_element = false;
        
        items.forEach(function(element, index) {
          if (!element) return;

          Lampa.Arrays.extend(element, {
            info: element.voice_name || '',
            quality: element.quality || '720p',
            time: '00:00'
          });
          
          var info = [];
          if (element.info) info.push(element.info);
          if (info.length) {
            element.info = info.map(function(i) {
              return '<span>' + i + '</span>';
            }).join('<span class="online-prestige-split">●</span>');
          }
          
          var html = Lampa.Template.get('online_prestige_full', element);

          element.mark = function() {
            viewed = Lampa.Storage.cache('online_view', 5000, []);
            var hash = Lampa.Utils.hash(element.title + element.url);
            if (viewed.indexOf(hash) == -1) {
              viewed.push(hash);
              Lampa.Storage.set('online_view', viewed);
            }
          };

          html.on('hover:enter', function() {
            if (object.movie && object.movie.id) {
              Lampa.Favorite.add('history', object.movie, 100);
            }
            if (params.onEnter) {
              params.onEnter(element, html, {});
            }
          }).on('hover:focus', function(e) {
            last = e.target;
            if (params.onFocus) {
              params.onFocus(element, html, {});
            }
            if (scroll && scroll.update) {
              scroll.update($(e.target), true);
            }
          });
          
          if (params.onRender) {
            params.onRender(element, html, {});
          }

          _this.contextMenu({
            html: html,
            element: element,
            onFile: function onFile(call) {
              if (params.onContextMenu) {
                params.onContextMenu(element, html, {}, call);
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
            title: '▶️ Запустить в Lampa',
            player: 'lampa'
          });

          if (extra && extra.file) {
            menu.push({
              title: '📋 Копировать ссылку',
              copylink: true
            });
          }

          Lampa.Select.show({
            title: 'Online Video',
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
                  Lampa.Noty.show('✅ Ссылка скопирована');
                }, function() {
                  Lampa.Noty.show('❌ Ошибка копирования');
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
      html.find('.online-empty__title').text(msg || 'Демо-режим: выберите вариант выше');
      scroll.append(html);
      this.loading(false);
    };

    this.doesNotAnswer = function() {
      this.reset();
      if (scroll) {
        var html = Lampa.Template.get('online_does_not_answer', {
          balanser: 'Online Video'
        });
        scroll.append(html);
      }
      this.loading(false);
    };

    this.getLastEpisode = function(items) {
      return 0;
    };

    this.start = function() {
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
            filter.show('Online Video', 'filter');
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
      version: '1.0.3',
      name: 'Online Video',
      description: 'Плагин для просмотра онлайн видео (тестовый режим)',
      component: 'online_rezka',
      onContextMenu: function onContextMenu(object) {
        return {
          name: '🎬 Смотреть онлайн',
          description: 'Тестовые видео потоки'
        };
      },
      onContextLauch: function onContextLauch(object) {
        resetTemplates();
        Lampa.Component.add('online_rezka', component);
        Lampa.Activity.push({
          url: '',
          title: 'Online Video',
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
    
    // CSS стили
    Lampa.Template.add('online_prestige_css', `
        <style>
        .online-prestige {
            position: relative;
            border-radius: .5em;
            background: rgba(0,0,0,0.3);
            display: flex;
            margin-bottom: 1em;
            padding: 1em;
            border: 1px solid rgba(255,255,255,0.1);
        }
        .online-prestige__body {
            padding: 0 1.2em;
            line-height: 1.4;
            flex-grow: 1;
        }
        .online-prestige__title {
            font-size: 1.3em;
            font-weight: 500;
            margin-bottom: 0.5em;
            color: #fff;
        }
        .online-prestige__quality {
            background: rgba(255,255,255,0.2);
            padding: 0.2em 0.8em;
            border-radius: 1em;
            font-size: 0.8em;
            color: #ccc;
        }
        .online-prestige__info {
            color: #aaa;
            font-size: 0.9em;
        }
        .online-prestige.focus {
            background: rgba(255,255,255,0.15);
            border-color: rgba(255,255,255,0.3);
        }
        .view--online {
            background: linear-gradient(45deg, #ff6b6b, #ee5a24);
            border-radius: 0.5em;
            margin: 0.5em;
            padding: 1em;
            text-align: center;
            font-weight: bold;
        }
        </style>
    `);
    $('body').append(Lampa.Template.get('online_prestige_css', {}, true));

    function resetTemplates() {
      Lampa.Template.add('online_prestige_full', `
          <div class="online-prestige online-prestige--full selector">
              <div class="online-prestige__body">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5em;">
                      <div class="online-prestige__title">{title}</div>
                      <div class="online-prestige__quality">{quality}</div>
                  </div>
                  <div class="online-prestige__info">{info}</div>
              </div>
          </div>
      `);
      
      Lampa.Template.add('online_does_not_answer', `
          <div style="padding: 2em; text-align: center; color: #888;">
              <div style="font-size: 2em; margin-bottom: 0.5em;">🎬</div>
              <div style="font-size: 1.2em; margin-bottom: 1em;">Online Video Plugin</div>
              <div>Выберите вариант из списка выше для просмотра тестового видео</div>
          </div>
      `);
      
      Lampa.Template.add('online_prestige_folder', `
          <div class="online-prestige online-prestige--folder selector">
              <div class="online-prestige__body">
                  <div class="online-prestige__title">{title}</div>
                  <div class="online-prestige__info">{info}</div>
              </div>
          </div>
      `);
    }

    var button = `
        <div class="full-start__button selector view--online" data-subtitle="Online Video">
            <div style="padding: 1em;">
                <div style="font-size: 1.5em; margin-bottom: 0.5em;">🎬</div>
                <span>Online Video</span>
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
            title: 'Online Video',
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
        } else {
          e.object.activity.render().find('.full-start__buttons').append(btn);
        }
      }
    });

    if (Lampa.Manifest.app_digital >= 177) {
      Lampa.Storage.sync('online_choice_rezka', 'object_object');
    }

    Lampa.Noty.show('✅ Online Video plugin loaded');
  }

  if (Lampa.Manifest.app_digital >= 155) {
    // Загружаем с задержкой чтобы Lampa успел инициализироваться
    setTimeout(startPlugin, 2000);
  }

})();
