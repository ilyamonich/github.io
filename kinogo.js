(function() {
  'use strict';

  // Используем сторонний API для поиска фильмов
  var search_api = 'https://api.allorigins.win/raw?url=' + encodeURIComponent('https://kinogo.ec/index.php?do=search&subaction=search&story=');
  var movie_api = 'https://api.allorigins.win/raw?url=';

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

    // Простой поиск по ключевым словам
    this.searchByTitle = function(_object, query) {
      var _this = this;
      object = _object;
      
      console.log('Kinogo search started for:', query);
      
      // Пробуем разные варианты поиска
      var searchAttempts = [
        query,
        object.movie.title || object.movie.name,
        object.movie.original_title || object.movie.original_name,
        (object.movie.title || object.movie.name) + ' ' + (object.movie.release_date ? object.movie.release_date.slice(0,4) : '')
      ];
      
      trySearch(0);
      
      function trySearch(attempt) {
        if (attempt >= searchAttempts.length) {
          console.log('All search attempts failed');
          component.doesNotAnswer();
          return;
        }
        
        var searchQuery = searchAttempts[attempt];
        if (!searchQuery) {
          trySearch(attempt + 1);
          return;
        }
        
        console.log('Search attempt', attempt + 1, 'for:', searchQuery);
        
        var url = search_api + encodeURIComponent(searchQuery);
        
        network.clear();
        network.timeout(15000);
        
        network.native(url, function(html) {
          if (html && html.length > 1000) { // Проверяем что получили нормальную страницу
            console.log('Search successful, parsing results...');
            parseAndFind(html, searchQuery);
          } else {
            console.log('Empty or invalid response, trying next...');
            trySearch(attempt + 1);
          }
        }, function(a, c) {
          console.log('Search attempt failed:', a, c);
          trySearch(attempt + 1);
        });
      }
      
      function parseAndFind(html, searchQuery) {
        try {
          // Простой парсинг поисковой выдачи
          var foundLinks = [];
          var tempDiv = document.createElement('div');
          tempDiv.innerHTML = html;
          
          // Ищем ссылки на фильмы
          var links = tempDiv.querySelectorAll('a[href*="/film"]');
          links.forEach(function(link) {
            var href = link.href;
            var title = link.textContent.trim();
            
            if (href && title && !href.includes('do=search') && href.includes('kinogo')) {
              // Проверяем соответствие названия
              var searchWords = searchQuery.toLowerCase().split(' ').filter(w => w.length > 2);
              var titleMatch = searchWords.some(word => title.toLowerCase().includes(word));
              
              if (titleMatch || searchWords.length === 0) {
                foundLinks.push({
                  url: href,
                  title: title,
                  id: href.split('/').pop().replace('.html', '')
                });
              }
            }
          });
          
          console.log('Found links:', foundLinks.length);
          
          if (foundLinks.length > 0) {
            // Берем первую подходящую ссылку
            var bestMatch = foundLinks[0];
            console.log('Selected best match:', bestMatch.title, bestMatch.url);
            _this.find(bestMatch.id, bestMatch.url);
          } else {
            console.log('No suitable links found');
            component.doesNotAnswer();
          }
          
        } catch (e) {
          console.error('Parse error:', e);
          component.doesNotAnswer();
        }
      }
    };

    this.find = function(kinogo_id, kinogo_url) {
      console.log('Loading movie from:', kinogo_url);
      
      var url = movie_api + encodeURIComponent(kinogo_url);
      
      network.clear();
      network.timeout(20000);
      
      network.native(url, function(html) {
        if (!html || html.length < 1000) {
          console.log('Invalid movie page');
          component.doesNotAnswer();
          return;
        }
        
        console.log('Movie page loaded, length:', html.length);
        
        try {
          var videoSources = extractVideoSources(html);
          console.log('Extracted video sources:', videoSources.length);
          
          if (videoSources.length > 0) {
            var result = {
              player_links: {
                movie: videoSources,
                playlist: {}
              }
            };
            success(result);
            component.loading(false);
          } else {
            console.log('No video sources found');
            component.doesNotAnswer();
          }
        } catch (e) {
          console.error('Error processing movie page:', e);
          component.doesNotAnswer();
        }
      }, function(a, c) {
        console.error('Failed to load movie page:', a, c);
        component.doesNotAnswer();
      });
    };

    function extractVideoSources(html) {
      var sources = [];
      var tempDiv = document.createElement('div');
      tempDiv.innerHTML = html;
      
      // 1. Ищем iframe
      var iframes = tempDiv.querySelectorAll('iframe');
      iframes.forEach(function(iframe, index) {
        if (iframe.src && iframe.src.includes('//')) {
          sources.push({
            link: iframe.src,
            translation: 'Iframe ' + (index + 1),
            quality: 720
          });
        }
      });
      
      // 2. Ищем видео в скриптах
      var scripts = tempDiv.querySelectorAll('script');
      scripts.forEach(function(script) {
        var scriptContent = script.textContent || script.innerText;
        if (scriptContent) {
          // Ищем URL видео файлов
          var videoUrls = scriptContent.match(/(https?:\/\/[^\s"']*\.(?:mp4|m3u8|mkv|avi)[^\s"']*)/gi);
          if (videoUrls) {
            videoUrls.forEach(function(url, index) {
              sources.push({
                link: url,
                translation: 'Video ' + (index + 1),
                quality: 1080
              });
            });
          }
          
          // Ищем данные в JSON
          try {
            var jsonMatch = scriptContent.match(/'file'\s*:\s*'([^']+)'/);
            if (jsonMatch && jsonMatch[1]) {
              sources.push({
                link: jsonMatch[1],
                translation: 'JSON Source',
                quality: 720
              });
            }
          } catch (e) {}
        }
      });
      
      // 3. Ищем data-link атрибуты
      var dataLinks = tempDiv.querySelectorAll('[data-link]');
      dataLinks.forEach(function(link, index) {
        var videoUrl = link.getAttribute('data-link');
        if (videoUrl && videoUrl.includes('//')) {
          sources.push({
            link: videoUrl,
            translation: 'Data Link ' + (index + 1),
            quality: 720
          });
        }
      });
      
      // 4. Ищем в тексте страницы прямые ссылки
      var textLinks = html.match(/(https?:\/\/[^\s"']*\.(?:mp4|m3u8)[^\s"']*)/gi);
      if (textLinks) {
        textLinks.forEach(function(url, index) {
          if (!sources.some(s => s.link === url)) {
            sources.push({
              link: url,
              translation: 'Direct ' + (index + 1),
              quality: 1080
            });
          }
        });
      }
      
      return sources;
    }

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
      if (results && results.player_links) {
        extractData(results);
        filter();
        append(filtred());
      }
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
      
      if (data.player_links.movie && data.player_links.movie.length > 0) {
        data.player_links.movie.forEach(function(movie, index) {
          extract[index + 1] = {
            file: movie.link,
            translation: movie.translation || 'Источник ' + (index + 1),
            quality: movie.quality || 720
          };
        });
      }
    }

    function getFile(element) {
      var translat = extract[element.translation];
      return {
        file: translat ? translat.file : '',
        quality: translat ? {'720p': translat.file} : false
      };
    }

    function filter() {
      filter_items = {
        season: [],
        voice: [],
        voice_info: []
      };

      for (var transl_id in extract) {
        var transl = extract[transl_id];
        filter_items.voice.push(transl.translation);
        filter_items.voice_info.push({
          id: parseInt(transl_id)
        });
      }

      if (component && component.filter) {
        component.filter(filter_items, choice);
      }
    }

    function filtred() {
      var filtred = [];

      for (var transl_id in extract) {
        var _element = extract[transl_id];
        filtred.push({
          title: _element.translation,
          quality: (_element.quality || 720) + 'p',
          translation: parseInt(transl_id),
          voice_name: _element.translation
        });
      }

      return filtred;
    }

    function append(items) {
      if (!component || !component.draw) return;
      
      component.reset();
      component.draw(items, {
        onEnter: function onEnter(item) {
          var extra = getFile(item);
          if (extra.file) {
            var play = {
              title: item.title,
              url: extra.file,
              quality: extra.quality
            };
            Lampa.Player.play(play);
          } else {
            Lampa.Noty.show('Ссылка на видео не найдена');
          }
        }
      });
    }
  }

  // Упрощенный компонент для отображения
  function component(object) {
    var network = new Lampa.Reguest();
    var scroll = new Lampa.Scroll({mask: true, over: true});
    var files = new Lampa.Explorer(object);
    var source = new kinogo(this, object);
    var initialized = false;

    this.initialize = function() {
      files.appendFiles(scroll.render());
      scroll.body().addClass('torrent-list');
      this.search();
    };

    this.create = function() {
      return this.render();
    };

    this.search = function() {
      this.activity.loader(true);
      if (source.searchByTitle) {
        source.searchByTitle(object, object.search || object.movie.original_title || object.movie.title);
      }
    };

    this.similars = function(json) {
      // Упрощенная обработка похожих
      this.doesNotAnswer();
    };

    this.reset = function() {
      network.clear();
      scroll.clear();
    };

    this.loading = function(status) {
      if (status) {
        this.activity.loader(true);
      } else {
        this.activity.loader(false);
        this.activity.toggle();
      }
    };

    this.filter = function(filter_items, choice) {
      // Простой фильтр
      var select = [{
        title: 'Сбросить',
        reset: true
      }];
      
      if (filter_items.voice && filter_items.voice.length) {
        var subitems = filter_items.voice.map(function(name, i) {
          return {
            title: name,
            selected: choice.voice == i,
            index: i
          };
        });
        select.push({
          title: 'Источник',
          items: subitems,
          stype: 'voice'
        });
      }
    };

    this.draw = function(items, params) {
      if (!items || items.length === 0) {
        this.empty();
        return;
      }
      
      items.forEach(function(element) {
        var html = Lampa.Template.get('online_prestige_full', {
          title: element.title,
          quality: element.quality,
          time: '',
          info: element.voice_name || ''
        });
        
        html.on('hover:enter', function() {
          if (params && params.onEnter) {
            params.onEnter(element, html);
          }
        });
        
        scroll.append(html);
      });
      
      this.loading(false);
      Lampa.Controller.enable('content');
    };

    this.empty = function() {
      var html = Lampa.Template.get('online_does_not_answer', {});
      scroll.append(html);
      this.loading(false);
    };

    this.doesNotAnswer = function() {
      this.reset();
      var html = Lampa.Template.get('online_does_not_answer', {
        balanser: 'kinogo'
      });
      scroll.append(html);
      this.loading(false);
    };

    this.start = function() {
      if (!initialized) {
        initialized = true;
        this.initialize();
      }

      Lampa.Controller.add('content', {
        toggle: function() {
          Lampa.Controller.collectionSet(scroll.render(), scroll.render());
        },
        up: function() {
          if (Navigator.canmove('up')) Navigator.move('up');
          else Lampa.Controller.toggle('head');
        },
        down: function() {
          Navigator.move('down');
        },
        back: function() {
          Lampa.Activity.backward();
        }
      });
      
      Lampa.Controller.toggle('content');
    };

    this.render = function() {
      return scroll.render();
    };

    this.back = function() {
      Lampa.Activity.backward();
    };

    this.destroy = function() {
      network.clear();
      if (source.destroy) source.destroy();
    };
  }

  function startPlugin() {
    if (window.online_kinogo) return;
    window.online_kinogo = true;

    var manifest = {
      type: 'video',
      version: '1.0.4',
      name: 'Онлайн - Kinogo',
      description: 'Плагин для просмотра фильмов с Kinogo',
      component: 'online_kinogo'
    };

    // Добавляем базовые переводы
    Lampa.Lang.add({
      online_balanser_dont_work: {
        ru: 'Не удалось найти видео на Kinogo',
        en: 'Failed to find video on Kinogo'
      },
      online_watch: {
        ru: 'Смотреть на Kinogo',
        en: 'Watch on Kinogo'
      },
      title_online: {
        ru: 'Kinogo',
        en: 'Kinogo'
      }
    });

    // Простые шаблоны
    Lampa.Template.add('online_prestige_full', `
      <div class="online-prestige selector" style="padding: 20px; margin: 10px; background: rgba(0,0,0,0.3); border-radius: 8px;">
        <div style="font-size: 18px; font-weight: bold; margin-bottom: 8px;">{title}</div>
        <div style="display: flex; justify-content: space-between;">
          <div>{info}</div>
          <div style="color: #aaa;">{quality}</div>
        </div>
      </div>
    `);

    Lampa.Template.add('online_does_not_answer', `
      <div style="text-align: center; padding: 40px;">
        <div style="font-size: 24px; margin-bottom: 20px;">#{online_balanser_dont_work}</div>
        <div style="color: #888;">Попробуйте другой фильм или проверьте подключение</div>
      </div>
    `);

    // Упрощенная кнопка
    var button = `
      <div class="full-start__button selector view--online" style="margin: 10px 0;">
        <div style="display: flex; align-items: center; padding: 15px; background: rgba(0,0,0,0.3); border-radius: 8px;">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 10px;">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
          </svg>
          <span>#{online_watch}</span>
        </div>
      </div>
    `;

    Lampa.Component.add('online_kinogo', component);

    // Добавляем кнопку в интерфейс
    Lampa.Listener.follow('full', function(e) {
      if (e.type == 'complite') {
        var btn = $(Lampa.Lang.translate(button));
        btn.on('hover:enter', function() {
          Lampa.Activity.push({
            url: '',
            title: Lampa.Lang.translate('title_online'),
            component: 'online_kinogo',
            movie: e.data.movie
          });
        });
        e.object.activity.render().find('.view--torrent').after(btn);
      }
    });

    Lampa.Manifest.plugins = manifest;
  }

  // Запускаем плагин
  if (Lampa.Manifest.app_digital >= 155) {
    setTimeout(startPlugin, 1000);
  }

})();
// V3.5
