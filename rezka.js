(function() {
  'use strict';

  var plugin_name = 'rezka';
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

    // Тестовые видео
    var testVideos = [
      {
        name: "🎬 Rezka - Основной перевод",
        url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
        quality: "1080p",
        qualities: ["480", "720", "1080"]
      },
      {
        name: "🎬 Rezka - Русская озвучка", 
        url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
        quality: "720p",
        qualities: ["360", "480", "720"]
      }
    ];

    function getVideoResults() {
      var movieTitle = object.movie.title || object.movie.name || 'Фильм';
      var year = parseInt((object.movie.release_date || object.movie.first_air_date || '0000').slice(0, 4)) || new Date().getFullYear();
      
      return testVideos.map(function(video, index) {
        return {
          title: movieTitle + ' - ' + video.name,
          quality: video.quality,
          qualitys: video.qualities,
          translation: index + 1,
          voice_name: video.name,
          file: video.url,
          url: video.url
        };
      });
    }

    function getSearchResults() {
      var movieTitle = object.movie.title || object.movie.name || 'Фильм';
      var year = parseInt((object.movie.release_date || object.movie.first_air_date || '0000').slice(0, 4)) || new Date().getFullYear();
      
      return [
        {
          id: 'main',
          title: movieTitle + ' (' + year + ')',
          original_title: movieTitle,
          year: year,
          url: 'main'
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
      
      Lampa.Noty.show('🔍 Rezka: поиск ' + (query || ''));
      
      setTimeout(function() {
        var foundItems = getSearchResults();
        
        if (foundItems && foundItems.length > 0) {
          wait_similars = true;
          component.similars(foundItems);
          component.loading(false);
        } else {
          component.doesNotAnswer();
        }
      }, 1000);
    };

    this.find = function(video_id) {
      var _this = this;
      
      Lampa.Noty.show('📥 Rezka: загрузка...');
      
      setTimeout(function() {
        var videoData = {
          player_links: {
            movie: getVideoResults(),
            playlist: {}
          }
        };
        
        if (videoData && videoData.player_links && videoData.player_links.movie.length > 0) {
          _this.success(videoData);
          component.loading(false);
          Lampa.Noty.show('✅ Rezka: готово!');
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
      // Логика извлечения данных
    }

    function getFile(element, max_quality) {
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
          if (movie.title) {
            filter_items.voice.push(movie.title);
            filter_items.voice_info.push({
              id: index + 1
            });
          }
        });
      }

      if (filter_items.voice.length === 0) {
        filter_items.voice.push('Rezka - Основной');
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
          var qualities = movie.qualitys || ['480', '720', '1080'];
          var maxQuality = qualities.length > 0 ? Math.max(...qualities.map(function(q) {
            return parseInt(q) || 480;
          })) : 720;
          
          filtred.push({
            title: movie.title || 'Rezka ' + (index + 1),
            quality: maxQuality + 'p',
            qualitys: qualities,
            translation: index + 1,
            voice_name: movie.title || 'Rezka ' + (index + 1),
            file: movie.file,
            url: movie.url
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
        direct: true,
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
              Lampa.Noty.show('▶️ Rezka: ' + item.title);
              
              var playObject = {
                title: item.title,
                url: extra.file,
                direct: true,
                quality: extra.quality
              };
              
              try {
                Lampa.Player.play(playObject);
                
                if (item.mark) {
                  item.mark();
                }
              } catch (e) {
                console.error('Play error:', e);
                Lampa.Noty.show('❌ Rezka: ошибка воспроизведения');
              }
            } else {
              Lampa.Noty.show('❌ Rezka: ссылка не найдена');
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
        if (filter.render) {
          files.appendHead(filter.render());
        }
        scroll.body().addClass('torrent-list');
        if (files.render) {
          scroll.minus(files.render().find('.explorer__files-head'));
        }
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
      // Заглушка для истории просмотров
    };

    this.draw = function(items) {
      var _this = this;
      var params = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

      if (!items || items.length === 0) {
        this.empty();
        return;
      }

      Lampa.Noty.show('✅ Rezka: найдено ' + items.length + ' видео');

      this.getEpisodes(items[0].season, function(episodes) {
        var scroll_to_element = false;
        
        items.forEach(function(element, index) {
          if (!element) return;

          Lampa.Arrays.extend(element, {
            info: element.voice_name || 'Rezka',
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
            // Заглушка для отметки просмотра
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
            title: '▶️ Воспроизвести',
            player: 'lampa'
          });

          if (extra && extra.file) {
            menu.push({
              title: '📋 Копировать ссылку',
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
      html.find('.online-empty__title').text(msg || 'Rezka: ничего не найдено');
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
    if (window.rezka_plugin) return;
    
    window.rezka_plugin = true;
    
    // Регистрируем плагин в Lampa
    var manifest = {
        id: 'rezka',
        type: 'online',
        name: 'Rezka.ag',
        version: '1.0.0'
    };

    // Добавляем в список источников
    if(typeof Lampa.Listener === 'object'){
        Lampa.Listener.follow('app', function(e){
            if(e.type == 'ready'){
                // Добавляем кнопку в интерфейс
                addRezkaButton();
            }
        });
    }

    function addRezkaButton() {
        // Создаем кнопку для Rezka
        var button = `
            <div class="source-selector__item selector" data-type="rezka">
                <div class="source-selector__item-body">
                    <div class="source-selector__item-icon" style="background: linear-gradient(135deg, #ff6b6b, #ee5a24);">
                        <span style="font-size: 24px;">🎬</span>
                    </div>
                    <div class="source-selector__item-info">
                        <div class="source-selector__item-name">Rezka.ag</div>
                        <div class="source-selector__item-description">Онлайн просмотр</div>
                    </div>
                </div>
            </div>
        `;

        // Добавляем кнопку когда открывается выбор источника
        Lampa.Listener.follow('source_selector', function(e) {
            if (e.type == 'render') {
                setTimeout(function() {
                    var container = e.object.activity.render().find('.source-selector__items');
                    if (container.length && !container.find('[data-type="rezka"]').length) {
                        var btn = $(button);
                        btn.on('hover:enter', function() {
                            launchRezka(e.object.movie);
                        });
                        container.append(btn);
                    }
                }, 100);
            }
        });
    }

    function launchRezka(movie) {
        resetTemplates();
        Lampa.Component.add('online_rezka', component);
        
        Lampa.Activity.push({
            url: '',
            title: 'Rezka.ag',
            component: 'online_rezka',
            search: movie.title,
            search_one: movie.title,
            search_two: movie.original_title,
            movie: movie,
            page: 1
        });
    }

    // CSS стили
    Lampa.Template.add('rezka_css', `
        <style>
        .source-selector__item[data-type="rezka"] {
            background: rgba(255, 107, 107, 0.1);
            border: 1px solid rgba(255, 107, 107, 0.3);
        }
        .source-selector__item[data-type="rezka"]:hover,
        .source-selector__item[data-type="rezka"].focus {
            background: rgba(255, 107, 107, 0.2);
            border-color: rgba(255, 107, 107, 0.6);
        }
        .online-rezka-item {
            background: rgba(30, 30, 46, 0.8);
            border-radius: 10px;
            padding: 15px;
            margin: 10px 0;
            border: 1px solid rgba(255,107,107,0.3);
        }
        .online-rezka-item.focus {
            background: rgba(41, 41, 65, 0.9);
            border-color: rgba(255,107,107,0.6);
        }
        .online-rezka-title {
            font-size: 16px;
            font-weight: 600;
            color: #fff;
            margin-bottom: 8px;
        }
        .online-rezka-info {
            font-size: 14px;
            color: #a0a0a0;
            margin-bottom: 5px;
        }
        .online-rezka-quality {
            display: inline-block;
            background: rgba(255,107,107,0.2);
            color: #ff6b6b;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 500;
        }
        </style>
    `);
    $('body').append(Lampa.Template.get('rezka_css', {}, true));

    function resetTemplates() {
      Lampa.Template.add('online_prestige_full', `
          <div class="online-rezka-item selector">
              <div class="online-rezka-title">{title}</div>
              <div class="online-rezka-info">{info}</div>
              <div class="online-rezka-quality">{quality}</div>
          </div>
      `);
      
      Lampa.Template.add('online_does_not_answer', `
          <div style="padding: 40px 20px; text-align: center; color: #888;">
              <div style="font-size: 48px; margin-bottom: 20px;">🎬</div>
              <div style="font-size: 20px; margin-bottom: 10px; color: #ff6b6b;">Rezka.ag</div>
              <div style="font-size: 14px;">Онлайн просмотр с Rezka.ag</div>
          </div>
      `);
      
      Lampa.Template.add('online_prestige_folder', `
          <div class="online-rezka-item selector">
              <div class="online-rezka-title">{title}</div>
              <div class="online-rezka-info">{info}</div>
          </div>
      `);
    }

    // Регистрируем компонент
    Lampa.Component.add('online_rezka', component);
    resetTemplates();

    console.log('✅ Rezka.ag Plugin loaded successfully');
  }

  // Запускаем плагин
  if (Lampa.Manifest.app_digital >= 155) {
    // Ждем полной загрузки Lampa
    if (window.Lampa && Lampa.Listener) {
        startPlugin();
    } else {
        document.addEventListener('lampa_started', startPlugin);
    }
  }

})();
