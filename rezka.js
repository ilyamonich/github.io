(function() {
  'use strict';

  var plugin_name = 'onlinevideo';
  var modalopen = false;

  function onlineVideoAPI(component, _object) {
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

    // Локальные тестовые видео файлы (работают без CORS)
    function getTestVideos() {
      return [
        {
          id: 1,
          title: '🎬 Тестовое видео 1',
          translation: 'Демо ролик HD',
          quality: '720p',
          qualities: ['480', '720'],
          url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
          type: 'direct'
        },
        {
          id: 2,
          title: '🎬 Тестовое видео 2', 
          translation: 'Короткий демо',
          quality: '480p',
          qualities: ['360', '480'],
          url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
          type: 'direct'
        },
        {
          id: 3,
          title: '🎬 Тестовое видео 3',
          translation: 'Демо с субтитрами',
          quality: '1080p',
          qualities: ['720', '1080'],
          url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
          type: 'direct'
        }
      ];
    }

    // Альтернативные HLS потоки (если прямые ссылки не работают)
    function getHLSVideos() {
      return [
        {
          id: 1,
          title: '📺 HLS Тест 1',
          translation: 'Адаптивный поток',
          quality: '720p',
          qualities: ['480', '720', '1080'],
          url: 'https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8',
          type: 'hls'
        },
        {
          id: 2,
          title: '📺 HLS Тест 2',
          translation: 'Мультибитрейт',
          quality: '1080p', 
          qualities: ['360', '720', '1080'],
          url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
          type: 'hls'
        }
      ];
    }

    this.search = function(_object, sim) {
      if (wait_similars && sim && sim.length > 0) {
        this.find(sim[0].id);
      }
    };

    this.searchByTitle = function(_object, query) {
      var _this = this;
      object = _object;
      
      Lampa.Noty.show('🔍 Поиск: ' + (query || 'демо видео'));
      
      // Имитируем поиск с задержкой
      setTimeout(function() {
        var searchResults = [
          {
            id: 'demo_main',
            title: (object.movie && object.movie.title) || 'Демо фильм',
            original_title: (object.movie && object.movie.original_title) || 'Demo Movie',
            year: new Date().getFullYear(),
            url: 'demo'
          },
          {
            id: 'demo_alt',
            title: ((object.movie && object.movie.title) || 'Фильм') + ' - альтернативная версия',
            original_title: (object.movie && object.movie.original_title) || 'Demo Movie',
            year: new Date().getFullYear(),
            url: 'demo_alt'
          }
        ];
        
        wait_similars = true;
        component.similars(searchResults);
        component.loading(false);
        
      }, 1000);
    };

    this.find = function(video_id) {
      var _this = this;
      
      Lampa.Noty.show('🎬 Подготавливаем видео...');
      
      setTimeout(function() {
        var videoData = {
          player_links: {
            movie: [],
            playlist: {}
          }
        };

        // Добавляем тестовые видео
        var testVideos = getTestVideos();
        testVideos.forEach(function(video) {
          videoData.player_links.movie.push({
            translation: video.translation,
            link: video.url,
            qualities: video.qualities,
            title: video.title,
            type: video.type
          });
        });

        // Добавляем HLS видео
        var hlsVideos = getHLSVideos();
        hlsVideos.forEach(function(video) {
          videoData.player_links.movie.push({
            translation: video.translation,
            link: video.url,
            qualities: video.qualities,
            title: video.title,
            type: video.type
          });
        });

        if (videoData.player_links.movie.length > 0) {
          _this.success(videoData);
          component.loading(false);
          Lampa.Noty.show('✅ Готово! Выберите видео для просмотра');
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
      // Минимальная логика извлечения данных
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
        quality: quality_obj,
        type: element.type || 'direct'
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
            title: movie.title || movie.translation || 'Видео ' + (index + 1),
            quality: maxQuality + 'p',
            qualitys: qualities,
            translation: index + 1,
            voice_name: movie.translation || 'Перевод ' + (index + 1),
            file: movie.link,
            url: movie.link,
            type: movie.type || 'direct'
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
        callback: element.mark || function() {},
        type: extra.type
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
              Lampa.Noty.show('🎬 Запускаем: ' + item.title);
              
              try {
                var playData = {
                  title: item.title,
                  url: extra.file,
                  quality: extra.quality
                };

                // Добавляем информацию о типе видео
                if (extra.type === 'hls') {
                  playData.hls = true;
                }

                console.log('Playing video:', playData);
                Lampa.Player.play(playData);
                
                if (item.mark) {
                  item.mark();
                }
              } catch (e) {
                console.error('Play error:', e);
                Lampa.Noty.show('❌ Ошибка воспроизведения: ' + e.message);
              }
            } else {
              Lampa.Noty.show('❌ Ошибка: нет ссылки на видео');
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
      onlinevideo: onlineVideoAPI
    };
    var last;
    var extended;
    var selected_id;
    var source;
    var balanser = 'onlinevideo';
    var initialized;
    var balanser_timer;
    var images = [];

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
                         (object.movie && (object.movie.original_title || 
                         object.movie.original_name || 
                         object.movie.title || 
                         object.movie.name)) ||
                         'демо видео';
        source.searchByTitle(object, searchQuery);
      }
    };

    this.getChoice = function(for_balanser) {
      var balancer_key = for_balanser || balanser;
      var data = Lampa.Storage.cache('online_choice_' + balancer_key, 3000, {});
      var save = data[selected_id || (object.movie && object.movie.id) || 'default'] || {};
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

        var name = elem.title || 'Демо видео';
        elem.title = name;
        elem.time = '';
        elem.info = info.join('<span class="online-prestige-split">●</span>');
        
        var item = Lampa.Template.get('online_prestige_folder', elem);
        item.on('hover:enter', function() {
          if (_this.activity && _this.activity.loader) {
            _this.activity.loader(true);
          }
          _this.reset();
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
        add('voice', 'Тип видео');
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
            select.push('Тип: ' + filter_items[i][need[i]]);
          }
        }
      }

      filter.chosen('filter', select);
      filter.chosen('sort', [balanser]);
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

    this.draw = function(items) {
      var _this = this;
      var params = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

      if (!items || items.length === 0) {
        this.empty();
        return;
      }

      Lampa.Noty.show('✅ Доступно видео: ' + items.length + ' вариантов');

      var viewed = [];
      var scroll_to_element = false;
      
      items.forEach(function(element, index) {
        if (!element) return;

        // Устанавливаем базовые свойства
        element.info = element.voice_name || '';
        element.quality = element.quality || '720p';
        element.time = '00:00';
        
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

        _this.contextMenu({
          html: html,
          element: element,
          onFile: function onFile(call) {
            if (params.onContextMenu) {
              params.onContextMenu(element, html, {}, call);
            }
          }
        });

        if (scroll && scroll.append) {
          scroll.append(html);
        }
      });

      if (Lampa.Controller && Lampa.Controller.enable) {
        Lampa.Controller.enable('content');
      }
    };

    this.contextMenu = function(params) {
      if (!params || !params.html) return;

      params.html.on('hover:long', function() {
        function show(extra) {
          var enabled = Lampa.Controller.enabled().name;
          var menu = [];

          menu.push({
            title: '▶️ Воспроизвести',
            player: 'lampa'
          });

          if (extra && extra.file) {
            menu.push({
              title: '📋 Скопировать ссылку',
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
      html.find('.online-empty__title').text(msg || 'Выберите вариант из списка');
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
    if (window.online_video_plugin) return;
    
    window.online_video_plugin = true;
    
    var manifest = {
      type: 'video',
      version: '1.0.4',
      name: 'Online Video',
      description: 'Плагин для просмотра тестового онлайн видео',
      component: 'online_video',
      onContextMenu: function onContextMenu(object) {
        return {
          name: '🎬 Смотреть онлайн (тест)',
          description: 'Тестовые видео потоки'
        };
      },
      onContextLauch: function onContextLauch(object) {
        resetTemplates();
        Lampa.Component.add('online_video', component);
        Lampa.Activity.push({
          url: '',
          title: 'Online Video',
          component: 'online_video',
          search: object.title,
          search_one: object.title,
          search_two: object.original_title,
          movie: object,
          page: 1
        });
      }
    };
    
    Lampa.Manifest.plugins = manifest;
    
    // Простые CSS стили
    Lampa.Template.add('online_prestige_css', `
        <style>
        .online-prestige {
            background: rgba(30, 30, 46, 0.8);
            border-radius: 12px;
            padding: 16px;
            margin: 8px 0;
            border: 1px solid rgba(255,255,255,0.1);
            transition: all 0.2s ease;
        }
        .online-prestige:hover, .online-prestige.focus {
            background: rgba(41, 41, 64, 0.9);
            border-color: rgba(255,255,255,0.2);
            transform: translateY(-2px);
        }
        .online-prestige__title {
            font-size: 16px;
            font-weight: 600;
            color: #fff;
            margin-bottom: 8px;
        }
        .online-prestige__info {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .online-prestige__quality {
            background: linear-gradient(45deg, #ff6b6b, #ee5a24);
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: bold;
            color: white;
        }
        .online-prestige__voice {
            color: #aaa;
            font-size: 14px;
        }
        .view--online {
            background: linear-gradient(45deg, #667eea, #764ba2);
            border-radius: 12px;
            margin: 8px;
            padding: 16px;
            text-align: center;
            font-weight: bold;
            color: white;
            border: none;
        }
        .view--online:hover {
            background: linear-gradient(45deg, #764ba2, #667eea);
        }
        </style>
    `);
    $('body').append(Lampa.Template.get('online_prestige_css', {}, true));

    function resetTemplates() {
      Lampa.Template.add('online_prestige_full', `
          <div class="online-prestige selector">
              <div class="online-prestige__title">{title}</div>
              <div class="online-prestige__info">
                  <div class="online-prestige__voice">{info}</div>
                  <div class="online-prestige__quality">{quality}</div>
              </div>
          </div>
      `);
      
      Lampa.Template.add('online_does_not_answer', `
          <div style="padding: 40px 20px; text-align: center; color: #888;">
              <div style="font-size: 48px; margin-bottom: 16px;">🎬</div>
              <div style="font-size: 20px; margin-bottom: 16px; color: #fff;">Online Video Plugin</div>
              <div style="font-size: 14px;">Выберите видео из списка для тестирования</div>
          </div>
      `);
      
      Lampa.Template.add('online_prestige_folder', `
          <div class="online-prestige selector">
              <div class="online-prestige__title">{title}</div>
              <div class="online-prestige__info">
                  <div class="online-prestige__voice">{info}</div>
              </div>
          </div>
      `);
    }

    var button = `
        <div class="full-start__button selector view--online">
            <div style="padding: 12px;">
                <div style="font-size: 24px; margin-bottom: 8px;">🎬</div>
                <div style="font-size: 14px; font-weight: bold;">Online Video</div>
                <div style="font-size: 11px; opacity: 0.8; margin-top: 4px;">Тестовые видео</div>
            </div>
        </div>
    `;

    Lampa.Component.add('online_video', component);
    resetTemplates();
    
    Lampa.Listener.follow('full', function(e) {
      if (e.type == 'complite') {
        var btn = $(button);
        btn.on('hover:enter', function() {
          resetTemplates();
          Lampa.Component.add('online_video', component);
          Lampa.Activity.push({
            url: '',
            title: 'Online Video',
            component: 'online_video',
            search: e.data.movie.title,
            search_one: e.data.movie.title,
            search_two: e.data.movie.original_title,
            movie: e.data.movie,
            page: 1
          });
        });
        
        var buttonsContainer = e.object.activity.render().find('.full-start__buttons');
        if (buttonsContainer.length) {
          buttonsContainer.append(btn);
        }
      }
    });

    console.log('✅ Online Video Plugin loaded successfully');
    Lampa.Noty.show('✅ Online Video plugin loaded');
  }

  // Загружаем плагин после инициализации Lampa
  if (Lampa.Manifest.app_digital >= 155) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startPlugin);
    } else {
      setTimeout(startPlugin, 3000);
    }
  }

})();
// V4.1
