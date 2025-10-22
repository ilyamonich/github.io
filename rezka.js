(function() {
  'use strict';

  var Defined = {
    api: 'kinobaza',
    localhost: '',
    apn: ''
  };

  var balansers_with_search = ['kinogo'];
  
  var unic_id = Lampa.Storage.get('kinobaza_unic_id', '');
  if (!unic_id) {
    unic_id = Lampa.Utils.uid(8).toLowerCase();
    Lampa.Storage.set('kinobaza_unic_id', unic_id);
  }

  function account(url) {
    url = url + '';
    if (url.indexOf('uid=') == -1) {
      var uid = Lampa.Storage.get('kinobaza_unic_id', '');
      if (uid) url = Lampa.Utils.addUrlComponent(url, 'uid=' + encodeURIComponent(uid));
    }
    return url;
  }
  
  var Network = Lampa.Reguest;

  // Парсер Kinogo.ec
  function KinogoParser() {
    this.baseUrl = 'https://kinogo.ec';
    this.searchUrl = 'https://kinogo.ec/index.php?do=search';
    this.network = new Network();
  }

  KinogoParser.prototype.search = function(query) {
    var _this = this;
    return new Promise(function(resolve, reject) {
      var formData = new FormData();
      formData.append('do', 'search');
      formData.append('subaction', 'search');
      formData.append('story', query);
      
      _this.network.native(_this.searchUrl, function(html) {
        var results = _this.parseSearchResults(html);
        resolve(results);
      }, function(error) {
        reject(error);
      }, formData, {
        method: 'POST',
        dataType: 'text'
      });
    });
  };

  KinogoParser.prototype.parseSearchResults = function(html) {
    var results = [];
    var parser = new DOMParser();
    var doc = parser.parseFromString(html, 'text/html');
    
    var items = doc.querySelectorAll('.shortstory');
    
    items.forEach(function(item) {
      try {
        var titleElem = item.querySelector('.short-title a');
        var imgElem = item.querySelector('.short-img img');
        var linkElem = item.querySelector('.short-title a');
        var detailsElem = item.querySelector('.short-date');
        
        if (titleElem && linkElem) {
          var title = titleElem.textContent.trim();
          var url = linkElem.href;
          var img = imgElem ? imgElem.src : '';
          var details = detailsElem ? detailsElem.textContent.trim() : '';
          var year = details.match(/\d{4}/);
          
          results.push({
            title: title,
            url: url,
            img: img,
            details: details,
            year: year ? year[0] : '',
            balanser: 'kinogo'
          });
        }
      } catch (e) {
        console.error('Error parsing kinogo item:', e);
      }
    });
    
    return results;
  };

  KinogoParser.prototype.getMovieInfo = function(url) {
    var _this = this;
    return new Promise(function(resolve, reject) {
      _this.network.native(url, function(html) {
        var info = _this.parseMovieInfo(html);
        resolve(info);
      }, reject, false, {
        dataType: 'text'
      });
    });
  };

  KinogoParser.prototype.parseMovieInfo = function(html) {
    var result = {
      videos: [],
      seasons: [],
      voices: []
    };
    
    try {
      var parser = new DOMParser();
      var doc = parser.parseFromString(html, 'text/html');
      
      // Парсим iframe с видео
      var iframes = doc.querySelectorAll('iframe');
      iframes.forEach(function(iframe, index) {
        if (iframe.src && iframe.src.includes('//')) {
          result.videos.push({
            method: 'play',
            url: iframe.src,
            title: 'Источник ' + (index + 1),
            quality: 'HD',
            text: 'Источник ' + (index + 1)
          });
        }
      });
      
      // Парсим ссылки на видео
      var links = doc.querySelectorAll('a[href*="//"]');
      links.forEach(function(link) {
        var href = link.href;
        var text = link.textContent.trim();
        
        if (href && (href.includes('youtube') || href.includes('vimeo') || href.includes('dailymotion') || 
            href.includes('mp4') || href.includes('m3u8') || href.includes('embed'))) {
          result.videos.push({
            method: 'play',
            url: href,
            title: text || 'Видео',
            quality: 'HD',
            text: text || 'Видео'
          });
        }
      });
      
      // Если нет видео, создаем заглушку
      if (result.videos.length === 0) {
        result.videos.push({
          method: 'play',
          url: 'about:blank',
          title: 'Видео временно недоступно',
          quality: 'HD',
          text: 'Попробуйте позже'
        });
      }
      
    } catch (e) {
      console.error('Error parsing kinogo movie:', e);
      result.videos.push({
        method: 'play',
        url: 'about:blank',
        title: 'Ошибка загрузки',
        quality: 'HD',
        text: 'Ошибка загрузки видео'
      });
    }
    
    return result;
  };

  function component(object) {
    var network = new Network();
    var scroll = new Lampa.Scroll({
      mask: true,
      over: true
    });
    var files = new Lampa.Explorer(object);
    var filter = new Lampa.Filter(object);
    var sources = {};
    var last;
    var source;
    var balanser = 'kinogo';
    var initialized;
    var balanser_timer;
    var images = [];
    var number_of_requests = 0;
    var filter_sources = ['kinogo'];
    var filter_translate = {
      season: Lampa.Lang.translate('torrent_serial_season'),
      voice: Lampa.Lang.translate('torrent_parser_voice'),
      source: Lampa.Lang.translate('settings_rest_source')
    };
    var filter_find = {
      season: [],
      voice: []
    };

    var kinogoParser = new KinogoParser();
	
    function clarificationSearchAdd(value){
      var id = Lampa.Utils.hash(object.movie.number_of_seasons ? object.movie.original_name : object.movie.original_title);
      var all = Lampa.Storage.get('clarification_search','{}');
      
      all[id] = value;
      
      Lampa.Storage.set('clarification_search',all);
    }
	
    function clarificationSearchDelete(){
      var id = Lampa.Utils.hash(object.movie.number_of_seasons ? object.movie.original_name : object.movie.original_title);
      var all = Lampa.Storage.get('clarification_search','{}');
      
      delete all[id];
      
      Lampa.Storage.set('clarification_search',all);
    }
	
    function clarificationSearchGet(){
      var id = Lampa.Utils.hash(object.movie.number_of_seasons ? object.movie.original_name : object.movie.original_title);
      var all = Lampa.Storage.get('clarification_search','{}');
      
      return all[id];
    }
	
    this.initialize = function() {
      var _this = this;
      this.loading(true);
      
      filter.onSearch = function(value) {
        clarificationSearchAdd(value);
        Lampa.Activity.replace({
          search: value,
          clarification: true,
          similar: true
        });
      };
      
      filter.onBack = function() {
        _this.start();
      };
      
      filter.render().find('.selector').on('hover:enter', function() {
        clearInterval(balanser_timer);
      });
      
      filter.render().find('.filter--search').appendTo(filter.render().find('.torrent-filter'));
      
      filter.onSelect = function(type, a, b) {
        if (type == 'filter') {
          if (a.reset) {
            clarificationSearchDelete();
            _this.replaceChoice({
              season: 0,
              voice: 0,
              voice_url: '',
              voice_name: ''
            });
            setTimeout(function() {
              Lampa.Select.close();
              Lampa.Activity.replace({
                clarification: 0,
                similar: 0
              });
            }, 10);
          }
        } else if (type == 'sort') {
          Lampa.Select.close();
        }
      };
      
      if (filter.addButtonBack) filter.addButtonBack();
      filter.render().find('.filter--sort span').text(Lampa.Lang.translate('kinobaza_balanser'));
      scroll.body().addClass('torrent-list');
      files.appendFiles(scroll.render());
      files.appendHead(filter.render());
      scroll.minus(files.render().find('.explorer__files-head'));
      scroll.body().append(Lampa.Template.get('kinobaza_content_loading'));
      Lampa.Controller.enable('content');
      this.loading(false);
	  
      if(object.balanser && object.url){
        return network.native(object.url, function(html) {
          var movieInfo = kinogoParser.parseMovieInfo(html);
          _this.display(movieInfo.videos);
        }, function(){
          files.render().find('.torrent-filter').remove();
          _this.empty();
        }, false, {
          dataType: 'text'
        });
      } 
      
      this.search();
    };

    this.search = function() {
      var _this = this;
      var searchQuery = object.clarification ? object.search : object.movie.title || object.movie.name;
      
      this.loading(true);
      
      kinogoParser.search(searchQuery).then(function(results) {
        if (results.length > 0) {
          if (results.length === 1 || object.clarification) {
            // Если найден один результат или это уточняющий поиск
            _this.loadMovie(results[0].url);
          } else {
            // Показываем список результатов
            _this.showSearchResults(results);
          }
        } else {
          _this.noResults();
        }
      }).catch(function(error) {
        console.error('Kinogo search error:', error);
        _this.noConnectToServer(error);
      });
    };

    this.loadMovie = function(url) {
      var _this = this;
      
      kinogoParser.getMovieInfo(url).then(function(movieInfo) {
        _this.display(movieInfo.videos);
      }).catch(function(error) {
        console.error('Kinogo movie load error:', error);
        _this.noConnectToServer(error);
      });
    };

    this.showSearchResults = function(results) {
      var _this = this;
      
      scroll.clear();
      scroll.body().append(Lampa.Template.get('kinobaza_content_loading'));
      
      setTimeout(function() {
        scroll.clear();
        
        results.forEach(function(result, index) {
          var item = Lampa.Template.get('kinobaza_prestige_folder', {
            title: result.title,
            info: result.details,
            time: result.year
          });
          
          if (result.img) {
            var image = $('<img style="height: 7em; width: 7em; border-radius: 0.3em;"/>');
            item.find('.online-prestige__folder').empty().append(image);
            Lampa.Utils.imgLoad(image, result.img);
          }
          
          item.on('hover:enter', function() {
            _this.reset();
            _this.loadMovie(result.url);
          }).on('hover:focus', function(e) {
            last = e.target;
            scroll.update($(e.target), true);
          });
          
          scroll.append(item);
        });
        
        _this.loading(false);
        Lampa.Controller.enable('content');
      }, 500);
    };

    this.display = function(videos) {
      var _this = this;
      
      this.draw(videos, {
        onEnter: function onEnter(item, html) {
          _this.getFileUrl(item, function(json, json_call) {
            if (json && json.url && json.url !== 'about:blank') {
              var playItem = _this.toPlayElement(item);
              playItem.url = json.url;
              playItem.headers = json_call.headers || json.headers;
              
              if (playItem.url) {
                Lampa.Player.play(playItem);
                item.mark();
              } else {
                Lampa.Noty.show(Lampa.Lang.translate('kinobaza_nolink'));
              }
            } else {
              Lampa.Noty.show('Видео временно недоступно. Попробуйте другой источник.');
            }
          }, true);
        },
        onContextMenu: function onContextMenu(item, html, data, call) {
          _this.getFileUrl(item, function(stream) {
            call({
              file: stream.url,
              quality: item.qualitys
            });
          }, true);
        }
      });
      
      this.filter({
        season: [],
        voice: []
      }, this.getChoice());
    };

    this.getFileUrl = function(file, call, direct) {
      if (direct) {
        call(file, {});
      } else {
        call({url: file.url}, {});
      }
    };

    this.toPlayElement = function(file) {
      return {
        title: file.title,
        url: file.url,
        quality: file.qualitys,
        timeline: file.timeline,
        subtitles: file.subtitles,
        callback: file.mark
      };
    };

    this.draw = function(items) {
      var _this = this;
      var params = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
      
      if (!items.length) return this.empty();
      
      scroll.clear();
      scroll.append(Lampa.Template.get('kinobaza_prestige_watched', {}));
      this.updateWatched();
      
      var viewed = Lampa.Storage.cache('online_view', 5000, []);
      
      items.forEach(function(element, index) {
        Lampa.Arrays.extend(element, {
          voice_name: element.text || element.title,
          info: element.text || element.title,
          quality: element.quality || 'HD',
          time: '00:00'
        });
        
        var hash_behold = Lampa.Utils.hash(element.title + element.url);
        var data = {
          hash_behold: hash_behold
        };
        
        var html = Lampa.Template.get('kinobaza_prestige_full', element);
        var loader = html.find('.online-prestige__loader');
        var image = html.find('.online-prestige__img');
        
        loader.remove();
        image.hide();
        
        html.find('.online-prestige__timeline').append(Lampa.Timeline.render(Lampa.Timeline.view(hash_behold)));
        
        if (viewed.indexOf(hash_behold) !== -1) {
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
        };
        
        html.on('hover:enter', function() {
          if (object.movie.id) Lampa.Favorite.add('history', object.movie, 100);
          if (params.onEnter) params.onEnter(element, html, data);
        }).on('hover:focus', function(e) {
          last = e.target;
          if (params.onFocus) params.onFocus(element, html, data);
          scroll.update($(e.target), true);
        });
        
        scroll.append(html);
      });
      
      Lampa.Controller.enable('content');
      this.loading(false);
    };

    this.noResults = function() {
      var html = Lampa.Template.get('kinobaza_does_not_answer', {});
      html.find('.online-empty__buttons').remove();
      html.find('.online-empty__title').text('Ничего не найдено');
      html.find('.online-empty__time').text('Попробуйте изменить поисковый запрос');
      scroll.clear();
      scroll.append(html);
      this.loading(false);
    };

    this.noConnectToServer = function(er) {
      var html = Lampa.Template.get('kinobaza_does_not_answer', {});
      html.find('.online-empty__buttons').remove();
      html.find('.online-empty__title').text('Ошибка соединения');
      html.find('.online-empty__time').text('Проверьте подключение к интернету и попробуйте снова');
      scroll.clear();
      scroll.append(html);
      this.loading(false);
    };

    this.empty = function() {
      var html = Lampa.Template.get('kinobaza_does_not_answer', {});
      html.find('.online-empty__buttons').remove();
      html.find('.online-empty__title').text(Lampa.Lang.translate('empty_title_two'));
      html.find('.online-empty__time').text(Lampa.Lang.translate('empty_text'));
      scroll.clear();
      scroll.append(html);
      this.loading(false);
    };

    // Остальные методы остаются без изменений
    this.getChoice = function() {
      return {
        season: 0,
        voice: 0,
        voice_name: '',
        voice_id: 0,
        episodes_view: {},
        movie_view: ''
      };
    };

    this.saveChoice = function(choice) {};
    this.replaceChoice = function(choice) {};

    this.reset = function() {
      last = false;
      clearInterval(balanser_timer);
      network.clear();
      scroll.render().find('.empty').remove();
      scroll.clear();
      scroll.reset();
      scroll.body().append(Lampa.Template.get('kinobaza_content_loading'));
    };

    this.loading = function(status) {
      if (status) this.activity.loader(true);
      else {
        this.activity.loader(false);
        this.activity.toggle();
      }
    };

    this.filter = function(filter_items, choice) {
      filter.set('filter', []);
      filter.set('sort', [{
        title: 'Kinogo.ec',
        source: 'kinogo',
        selected: true,
        ghost: false
      }]);
      this.selected(filter_items);
    };

    this.selected = function(filter_items) {
      filter.chosen('filter', []);
      filter.chosen('sort', ['Kinogo.ec']);
    };

    this.watched = function(set) {
      return {};
    };

    this.updateWatched = function() {
      var body = scroll.body().find('.online-prestige-watched .online-prestige-watched__body').empty();
      body.append('<span>' + Lampa.Lang.translate('kinobaza_no_watch_history') + '</span>');
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
        gone: function gone() {
          clearTimeout(balanser_timer);
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
        back: this.back.bind(this)
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
      files.destroy();
      scroll.destroy();
      clearInterval(balanser_timer);
    };
  }

  function addKinogoSearch() {
    var source = {
      title: 'Kinogo.ec',
      search: function(params, oncomplite) {
        var parser = new KinogoParser();
        
        parser.search(params.query).then(function(results) {
          var rows = [];
          
          if (results.length > 0) {
            var cards = results.map(function(item) {
              return {
                title: item.title,
                original_title: item.title,
                release_date: item.year || '0000',
                year: item.year,
                balanser: 'kinogo',
                url: item.url,
                img: item.img,
                details: item.details
              };
            });
            
            rows.push({
              title: 'Результаты поиска',
              results: cards
            });
          }
          
          oncomplite(rows);
        }).catch(function(error) {
          console.error('Kinogo search error:', error);
          oncomplite([]);
        });
      },
      onCancel: function() {
        // Очистка при отмене
      },
      params: {
        lazy: true,
        align_left: true,
        card_events: {
          onMenu: function() {}
        }
      },
      onMore: function(params, close) {
        close();
      },
      onSelect: function(params, close) {
        close();
        Lampa.Activity.push({
          url: params.element.url,
          title: 'Кинобаза - ' + params.element.title,
          component: 'kinobaza',
          movie: params.element,
          page: 1,
          search: params.element.title,
          clarification: true,
          balanser: 'kinogo',
          noinfo: true
        });
      }
    };

    Lampa.Search.addSource(source);
  }

  function startPlugin() {
    if (window.kinobaza_plugin) return;
    window.kinobaza_plugin = true;

    console.log('Кинобаза: Инициализация плагина с прямым парсингом Kinogo.ec');

    var manifst = {
      type: 'video',
      version: '2.0.0',
      name: 'Кинобаза',
      description: 'Плагин для просмотра онлайн сериалов и фильмов с прямым доступом к Kinogo.ec',
      component: 'kinobaza',
      onContextMenu: function onContextMenu(object) {
        return {
          name: Lampa.Lang.translate('kinobaza_watch'),
          description: ''
        };
      },
      onContextLauch: function onContextLauch(object) {
        resetTemplates();
        Lampa.Component.add('kinobaza', component);
        
        var id = Lampa.Utils.hash(object.number_of_seasons ? object.original_name : object.original_title);
        var all = Lampa.Storage.get('clarification_search','{}');
        
        Lampa.Activity.push({
          url: '',
          title: Lampa.Lang.translate('title_online'),
          component: 'kinobaza',
          search: all[id] ? all[id] : object.title,
          search_one: object.title,
          search_two: object.original_title,
          movie: object,
          page: 1,
          clarification: all[id] ? true : false
        });
      }
    };

    // Добавляем переводы
    Lampa.Lang.add({
      kinobaza_watch: { ru: 'Смотреть онлайн', en: 'Watch online', uk: 'Дивитися онлайн', zh: '在线观看' },
      kinobaza_video: { ru: 'Видео', en: 'Video', uk: 'Відео', zh: '视频' },
      kinobaza_no_watch_history: { ru: 'Нет истории просмотра', en: 'No browsing history', ua: 'Немає історії перегляду', zh: '没有浏览历史' },
      kinobaza_nolink: { ru: 'Не удалось извлечь ссылку', uk: 'Неможливо отримати посилання', en: 'Failed to fetch link', zh: '获取链接失败' },
      kinobaza_balanser: { ru: 'Источник', uk: 'Джерело', en: 'Source', zh: '来源' },
      helper_online_file: { ru: 'Удерживайте клавишу "ОК" для вызова контекстного меню', uk: 'Утримуйте клавішу "ОК" для виклику контекстного меню', en: 'Hold the "OK" key to bring up the context menu', zh: '按住"确定"键调出上下文菜单' },
      title_online: { ru: 'Онлайн', uk: 'Онлайн', en: 'Online', zh: '在线的' }
    });

    // CSS стили
    Lampa.Template.add('kinobaza_css', `
        <style>
        .online-prestige{position:relative;border-radius:.3em;background-color:rgba(0,0,0,0.3);display:flex}
        .online-prestige__body{padding:1.2em;line-height:1.3;flex-grow:1;position:relative}
        .online-prestige__img{position:relative;width:13em;flex-shrink:0;min-height:8.2em}
        .online-prestige__img>img{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;border-radius:.3em;opacity:0;transition:opacity .3s}
        .online-prestige__img--loaded>img{opacity:1}
        .online-prestige__folder{padding:1em;flex-shrink:0}
        .online-prestige__viewed{position:absolute;top:1em;left:1em;background:rgba(0,0,0,0.45);border-radius:100%;padding:.25em;font-size:.76em}
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
        .online-prestige-watched{padding:1em}
        .online-prestige-watched__icon>svg{width:1.5em;height:1.5em}
        .online-prestige-watched__body{padding-left:1em;padding-top:.1em;display:flex;flex-wrap:wrap}
        .online-prestige-watched__body>span+span::before{content:' ● ';vertical-align:top;display:inline-block;margin:0 .5em}
        </style>
    `);
    $('body').append(Lampa.Template.get('kinobaza_css', {}, true));

    function resetTemplates() {
      Lampa.Template.add('kinobaza_prestige_full', `
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
      
      Lampa.Template.add('kinobaza_content_loading', `
          <div class="online-empty">
              <div class="broadcast__scan"><div></div></div>
              <div style="text-align: center; padding: 2em;">
                  <div>Поиск на Kinogo.ec...</div>
              </div>
          </div>
      `);
      
      Lampa.Template.add('kinobaza_does_not_answer', `
          <div class="online-empty">
              <div class="online-empty__title">{title}</div>
              <div class="online-empty__time">{text}</div>
          </div>
      `);
      
      Lampa.Template.add('kinobaza_prestige_folder', `
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
      
      Lampa.Template.add('kinobaza_prestige_watched', `
          <div class="online-prestige online-prestige-watched selector">
              <div class="online-prestige-watched__icon">
                  <svg width="21" height="21" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <circle cx="10.5" cy="10.5" r="9" stroke="currentColor" stroke-width="3"/>
                      <path d="M14.8477 10.5628L8.20312 14.399L8.20313 6.72656L14.8477 10.5628Z" fill="currentColor"/>
                  </svg>
              </div>
              <div class="online-prestige-watched__body"></div>
          </div>
      `);
    }

    // Добавляем Kinogo.ec в поиск
    addKinogoSearch();

    Lampa.Component.add('kinobaza', component);
    resetTemplates();

    // Добавляем кнопку
    var button = `
        <div class="full-start__button selector view--online kinobaza--button" data-subtitle="Кинобаза v2.0.0">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 392.697 392.697" style="width: 24px; height: 24px;">
                <path d="M21.837,83.419l36.496,16.678L227.72,19.886c1.229-0.592,2.002-1.846,1.98-3.209c-0.021-1.365-0.834-2.592-2.082-3.145L197.766,0.3c-0.903-0.4-1.933-0.4-2.837,0L21.873,77.036c-1.259,0.559-2.073,1.803-2.081,3.18C19.784,81.593,20.584,82.847,21.837,83.419z" fill="currentColor"/>
                <path d="M185.689,177.261l-64.988-30.01v91.617c0,0.856-0.44,1.655-1.167,2.114c-0.406,0.257-0.869,0.386-1.333,0.386c-0.368,0-0.736-0.082-1.079-0.244l-68.874-32.625c-0.869-0.416-1.421-1.293-1.421-2.256v-92.229L6.804,95.5c-1.083-0.496-2.344-0.406-3.347,0.238c-1.002,0.645-1.608,1.754-1.608,2.944v208.744c0,1.371,0.799,2.615,2.045,3.185l178.886,81.768c0.464,0.211,0.96,0.315,1.455,0.315c0.661,0,1.318-0.188,1.892-0.555c1.002-0.645,1.608-1.754,1.608-2.945V180.445C187.735,179.076,186.936,177.831,185.689,177.261z" fill="currentColor"/>
                <path d="M389.24,95.74c-1.002-0.644-2.264-0.732-3.347-0.238l-178.876,81.76c-1.246,0.57-2.045,1.814-2.045,3.185v208.751c0,1.191,0.606,2.302,1.608,2.945c0.572,0.367,1.23,0.555,1.892,0.555c0.495,0,0.991-0.104,1.455-0.315l178.876-81.768c1.246-0.568,2.045-1.813,2.045-3.185V98.685C390.849,97.494,390.242,96.384,389.24,95.74z" fill="currentColor"/>
                <path d="M372.915,80.216c-0.009-1.377-0.823-2.621-2.082-3.18l-60.182-26.681c-0.938-0.418-2.013-0.399-2.938,0.045l-173.755,82.992l60.933,29.117c0.462,0.211,0.958,0.316,1.455,0.316s0.993-0.105,1.455-0.316l173.066-79.092C372.122,82.847,372.923,81.593,372.915,80.216z" fill="currentColor"/>
            </svg>
            <span>#{title_online}</span>
        </div>
    `;

    function addButton(e) {
      if (e.render.find('.kinobaza--button').length) return;
      var btn = $(Lampa.Lang.translate(button));
      btn.on('hover:enter', function() {
        resetTemplates();
        Lampa.Component.add('kinobaza', component);
        
        var id = Lampa.Utils.hash(e.movie.number_of_seasons ? e.movie.original_name : e.movie.original_title);
        var all = Lampa.Storage.get('clarification_search','{}');
        
        Lampa.Activity.push({
          url: '',
          title: Lampa.Lang.translate('title_online'),
          component: 'kinobaza',
          search: all[id] ? all[id] : e.movie.title,
          search_one: e.movie.title,
          search_two: e.movie.original_title,
          movie: e.movie,
          page: 1,
          clarification: all[id] ? true : false
        });
      });
      e.render.after(btn);
    }

    Lampa.Listener.follow('full', function(e) {
      if (e.type == 'complite') {
        addButton({
          render: e.object.activity.render().find('.view--torrent'),
          movie: e.data.movie
        });
      }
    });

    try {
      if (Lampa.Activity.active().component == 'full') {
        addButton({
          render: Lampa.Activity.active().activity.render().find('.view--torrent'),
          movie: Lampa.Activity.active().card
        });
      }
    } catch (e) {}

    console.log('Кинобаза: Плагин успешно инициализирован с прямым парсингом Kinogo.ec');
  }

  if (!window.kinobaza_plugin) {
    setTimeout(startPlugin, 1000);
  }

})();
// V2
