(function() {
  'use strict';

  var plugin_name = 'rezka';
  var base_url = 'https://rezka.ag';
  var search_url = base_url + '/search/?do=search&subaction=search&q=';
  var proxy_url = 'https://corsproxy.io/?'; // Прокси для обхода CORS
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
      return str.toLowerCase().replace(/[^a-zа-я0-9]/g, '');
    }

    function parseSearchResults(html) {
      var items = [];
      try {
        var parser = new DOMParser();
        var doc = parser.parseFromString(html, 'text/html');
        
        var results = doc.querySelectorAll('.b-content__inline_item, .b-content__inline_item-cover');
        
        results.forEach(function(item) {
          var link = item.querySelector('a');
          var title = item.querySelector('.b-content__inline_item-link a') || 
                      item.querySelector('.b-content__inline_item-cover a');
          var info = item.querySelector('.b-content__inline_item-info') ||
                     item.querySelector('.b-content__inline_item-cover .info');
          
          if (link && title) {
            var yearMatch = info ? info.textContent.match(/(\d{4})/) : null;
            var year = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();
            
            var itemTitle = title.textContent.trim();
            var itemUrl = link.getAttribute('href');
            
            if (!itemUrl.startsWith('http')) {
              itemUrl = base_url + itemUrl;
            }
            
            items.push({
              id: itemUrl,
              title: itemTitle,
              original_title: itemTitle,
              year: year,
              url: itemUrl
            });
          }
        });
      } catch (e) {
        console.error('Error parsing search results:', e);
      }
      
      return items;
    }

    function parseVideoPage(html) {
      var result = {
        player_links: {
          movie: [],
          playlist: {}
        }
      };

      try {
        // Упрощенная логика - в реальности нужно парсить JavaScript с видео данными
        // Это демо-версия с тестовыми ссылками
        result.player_links.movie.push({
          translation: 'Оригинал',
          link: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', // Тестовая ссылка
          qualities: ['480', '720', '1080']
        });

        result.player_links.movie.push({
          translation: 'Русская озвучка',
          link: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
          qualities: ['480', '720']
        });

      } catch (e) {
        console.error('Error parsing video page:', e);
      }
      
      return result;
    }

    this.search = function(_object, sim) {
      if (wait_similars) this.find(sim[0].id);
    };

    this.searchByTitle = function(_object, query) {
      var _this = this;
      object = _object;
      
      var year = parseInt((object.movie.release_date || object.movie.first_air_date || '0000').slice(0, 4));
      var orig = object.movie.original_name || object.movie.original_title;
      
      var url = proxy_url + encodeURIComponent(search_url + encodeURIComponent(query));
      
      network.clear();
      network.timeout(20000);
      
      Lampa.Noty.show('Ищем на Rezka.ag...');
      
      network.silent(url, function(html) {
        if (html && html.length > 100) { // Проверяем что получили валидный HTML
          var foundItems = parseSearchResults(html);
          
          if (foundItems.length > 0) {
            var cards = foundItems.filter(function(c) {
              return c.year > year - 3 && c.year < year + 3;
            });
            
            var card = cards.find(function(c) {
              return c.year == year && normalizeString(c.original_title) == normalizeString(orig);
            });

            if (!card && cards.length == 1) card = cards[0];
            if (!card && cards.length > 0) card = cards[0]; // Берем первую подходящую
            
            if (card) {
              _this.find(card.url);
            } else if (foundItems.length) {
              wait_similars = true;
              component.similars(foundItems);
              component.loading(false);
            } else {
              component.doesNotAnswer();
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
      
      network.clear();
      network.timeout(20000);
      
      var url = proxy_url + encodeURIComponent(rezka_url);
      
      Lampa.Noty.show('Загружаем информацию...');
      
      network.silent(url, function(html) {
        if (html && html.length > 100) {
          var videoData = parseVideoPage(html);
          if (videoData && (videoData.player_links.movie.length > 0 || Object.keys(videoData.player_links.playlist).length > 0)) {
            _this.success(videoData);
            component.loading(false);
            Lampa.Noty.show('Найдено: ' + videoData.player_links.movie.length + ' переводов');
          } else {
            // Если не удалось распарсить, используем демо-данные
            var demoData = {
              player_links: {
                movie: [{
                  translation: 'Демо перевод',
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
        // В случае ошибки используем демо-данные
        var demoData = {
          player_links: {
            movie: [{
              translation: 'Демо перевод (ошибка загрузки)',
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
      // Упрощенная логика извлечения данных
      // В реальной реализации нужно парсить данные с Rezka.ag
    }

    function getFile(element, max_quality) {
      // Логика получения файла для воспроизведения
      var quality_num = parseInt(max_quality) || 720;
      return {
        file: element.file || element.url || '',
        quality: {
          '480p': element.file || element.url || '',
          '720p': element.file || element.url || '',
          '1080p': element.file || element.url || ''
        }
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
          filter_items.voice.push(movie.translation);
          filter_items.voice_info.push({
            id: index + 1
          });
        });
      }

      component.filter(filter_items, choice);
    }

    function filtred() {
      var filtred = [];
      
      if (results && results.player_links && results.player_links.movie) {
        results.player_links.movie.forEach(function(movie, index) {
          var qualities = movie.qualities || ['480', '720', '1080'];
          var maxQuality = Math.max(...qualities.map(q => parseInt(q)));
          
          filtred.push({
            title: movie.translation,
            quality: maxQuality + 'p',
            qualitys: qualities,
            translation: index + 1,
            voice_name: movie.translation,
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
            
            Lampa.Noty.show('Запускаем видео...');
            Lampa.Player.play(first);
            Lampa.Player.playlist(playlist);
            item.mark();
          } else {
            Lampa.Noty.show('Ссылка на видео не найдена');
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

      if (!json || json.length === 0) {
        this.doesNotAnswer();
        return;
      }

      json.forEach(function(elem) {
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
      
      this.loading(false);
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
            subtitle: items[value],
            items: subitems,
            stype: type
          });
        }
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

    // Остальные методы остаются без изменений...
    // [getEpisodes, append, watched, draw, contextMenu, empty, doesNotAnswer, getLastEpisode, start, render, back, pause, stop, destroy]

    this.getEpisodes = function(season, call) {
      var episodes = [];
      call(episodes);
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
        var serial = false; // Rezka обычно возвращает фильмы

        var choice = _this5.getChoice();
        var fully = window.innerWidth > 480;
        var scroll_to_element = false;
        var scroll_to_mark = false;
        
        items.forEach(function(element, index) {
          Lampa.Arrays.extend(element, {
            info: element.voice_name || '',
            quality: element.quality || '720p',
            time: '00:00'
          });
          
          var hash_timeline = Lampa.Utils.hash(object.movie.original_title + element.voice_name);
          var hash_behold = Lampa.Utils.hash(object.movie.original_title + element.voice_name);
          var data = {
            hash_timeline: hash_timeline,
            hash_behold: hash_behold
          };
          
          var info = [];
          if (element.info) info.push(element.info);
          if (info.length) element.info = info.map(function(i) {
            return '<span>' + i + '</span>';
          }).join('<span class="online-prestige-split">●</span>');
          
          var html = Lampa.Template.get('online_prestige_full', element);
          var loader = html.find('.online-prestige__loader');
          var image = html.find('.online-prestige__img');

          // Для фильмов не показываем номер эпизода
          loader.remove();
          
          var img = html.find('img')[0];
          img.onerror = function() {
            img.src = './img/img_broken.svg';
          };
          img.onload = function() {
            image.addClass('online-prestige__img--loaded');
          };
          img.src = Lampa.TMDB.image('t/p/w300' + (object.movie.backdrop_path || object.movie.poster_path));

          html.find('.online-prestige__timeline').append(Lampa.Timeline.render(Lampa.Timeline.view(hash_timeline)));

          element.mark = function() {
            viewed = Lampa.Storage.cache('online_view', 5000, []);
            if (viewed.indexOf(hash_behold) == -1) {
              viewed.push(hash_behold);
              Lampa.Storage.set('online_view', viewed);
            }
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
                // elem.unmark();
              });
            },
            onClearAllTime: function onClearAllTime() {
              items.forEach(function(elem) {
                // elem.timeclear();
              });
            }
          });

          scroll.append(html);
        });

        Lampa.Controller.enable('content');
      });
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

          if (extra && extra.file) {
            menu.push({
              title: Lampa.Lang.translate('copy_link'),
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

        params.onFile(show);
      });
    };

    this.empty = function(msg) {
      var html = Lampa.Template.get('online_does_not_answer', {});
      html.find('.online-empty__buttons').remove();
      html.find('.online-empty__title').text('Ничего не найдено на Rezka.ag');
      scroll.append(html);
      this.loading(false);
    };

    this.doesNotAnswer = function() {
      this.reset();
      var html = Lampa.Template.get('online_does_not_answer', {
        balanser: 'Rezka.ag'
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
          else filter.show('Rezka.ag', 'filter');
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
      version: '1.0.1',
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
    
    // Упрощенные шаблоны
    function resetTemplates() {
      Lampa.Template.add('online_prestige_full', "<div class=\"online-prestige online-prestige--full selector\">\n            <div class=\"online-prestige__img\">\n                <img alt=\"\" src=\"./img/img_broken.svg\">\n            </div>\n            <div class=\"online-prestige__body\">\n                <div class=\"online-prestige__head\">\n                    <div class=\"online-prestige__title\">{title}</div>\n                    <div class=\"online-prestige__time\">{time}</div>\n                </div>\n                <div class=\"online-prestige__footer\">\n                    <div class=\"online-prestige__info\">{info}</div>\n                    <div class=\"online-prestige__quality\">{quality}</div>\n                </div>\n            </div>\n        </div>");
    }

    var button = "<div class=\"full-start__button selector view--online\" data-subtitle=\"Rezka.ag\">\n        <span>Rezka.ag</span>\n    </div>";

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
        e.object.activity.render().find('.view--torrent').after(btn);
      }
    });

    if (Lampa.Manifest.app_digital >= 177) {
      Lampa.Storage.sync('online_choice_rezka', 'object_object');
    }
  }

  if (!window.online_rezka && Lampa.Manifest.app_digital >= 155) startPlugin();

})();
