(function() {
  'use strict';

  function component(object) {
    var network = new Lampa.Reguest();
    var scroll = new Lampa.Scroll({
      mask: true,
      over: true
    });
    var files = new Lampa.Explorer(object);
    var filter = new Lampa.Filter(object);
    var initialized = false;

    this.initialize = function() {
      var _this = this;
      this.loading(true);
      
      filter.onSearch = function(value) {
        Lampa.Noty.show('Функция поиска временно недоступна');
      };
      
      filter.onBack = function() {
        _this.start();
      };
      
      filter.render().find('.selector').on('hover:enter', function() {
        // clearInterval(balanser_timer);
      });
      
      filter.render().find('.filter--search').appendTo(filter.render().find('.torrent-filter'));
      
      filter.onSelect = function(type, a, b) {
        if (type == 'filter') {
          if (a.reset) {
            setTimeout(function() {
              Lampa.Select.close();
              Lampa.Activity.replace({
                clarification: 0,
                similar: 0
              });
            }, 10);
          }
        }
      };
      
      if (filter.addButtonBack) filter.addButtonBack();
      filter.render().find('.filter--sort span').text('Кинобаза');
      scroll.body().addClass('torrent-list');
      files.appendFiles(scroll.render());
      files.appendHead(filter.render());
      scroll.minus(files.render().find('.explorer__files-head'));
      
      this.showInfo();
      Lampa.Controller.enable('content');
      this.loading(false);
    };

    this.showInfo = function() {
      scroll.clear();
      
      var html = `
        <div class="online-empty" style="text-align: center; padding: 3em;">
          <div class="online-empty__title" style="font-size: 2em; margin-bottom: 1em;">
            Кинобаза
          </div>
          <div class="online-empty__time" style="font-size: 1.2em; margin-bottom: 2em; line-height: 1.5;">
            Плагин для просмотра фильмов и сериалов<br>
            <span style="color: #888; font-size: 0.9em;">Версия 2.0.0</span>
          </div>
          <div style="margin-bottom: 2em; padding: 1.5em; background: rgba(255,255,255,0.1); border-radius: 0.5em;">
            <div style="font-size: 1.1em; margin-bottom: 1em;">📺 Доступные источники:</div>
            <div style="text-align: left; display: inline-block;">
              <div style="padding: 0.5em 1em; margin: 0.3em 0; background: rgba(255,255,255,0.2); border-radius: 0.3em;">
                • Kinogo.ec
              </div>
              <div style="padding: 0.5em 1em; margin: 0.3em 0; background: rgba(255,255,255,0.2); border-radius: 0.3em;">
                • HDRezka
              </div>
              <div style="padding: 0.5em 1em; margin: 0.3em 0; background: rgba(255,255,255,0.2); border-radius: 0.3em;">
                • Filmix
              </div>
            </div>
          </div>
          <div class="online-empty__buttons">
            <div class="online-empty__button selector" onclick="window.open('https://kinogo.ec', '_blank')" style="margin: 0.5em;">
              Перейти на Kinogo.ec
            </div>
            <div class="online-empty__button selector" onclick="Lampa.Activity.backward()" style="margin: 0.5em;">
              Назад
            </div>
          </div>
        </div>
      `;
      
      scroll.append($(html));
      
      // Добавляем обработчики для кнопок
      scroll.render().find('.online-empty__button').on('hover:enter', function() {
        $(this).trigger('click');
      });
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
          Lampa.Controller.collectionFocus(scroll.render().find('.selector')[0], scroll.render());
        },
        gone: function gone() {
          // clear timeout
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
          else filter.show('Фильтр', 'filter');
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

    this.loading = function(status) {
      if (status) this.activity.loader(true);
      else {
        this.activity.loader(false);
        this.activity.toggle();
      }
    };

    this.pause = function() {};
    this.stop = function() {};
    this.destroy = function() {
      network.clear();
      files.destroy();
      scroll.destroy();
    };
  }

  function startPlugin() {
    if (window.kinobaza_plugin) return;
    window.kinobaza_plugin = true;

    console.log('Кинобаза: Инициализация плагина');

    var manifst = {
      type: 'video',
      version: '2.0.0',
      name: 'Кинобаза',
      description: 'Плагин для просмотра онлайн сериалов и фильмов',
      component: 'kinobaza',
      onContextMenu: function onContextMenu(object) {
        return {
          name: 'Смотреть онлайн (Кинобаза)',
          description: 'Открыть в Кинобазе'
        };
      },
      onContextLauch: function onContextLauch(object) {
        Lampa.Component.add('kinobaza', component);
        
        Lampa.Activity.push({
          url: '',
          title: 'Кинобаза',
          component: 'kinobaza',
          movie: object,
          page: 1
        });
      }
    };

    // Добавляем CSS
    Lampa.Template.add('kinobaza_css', `
        <style>
        .kinobaza--button {
            position: relative;
            display: flex;
            align-items: center;
            padding: 1em 1.5em;
            margin: 0.5em 0;
            background: rgba(255,255,255,0.1);
            border-radius: 0.5em;
            transition: all 0.3s;
        }
        .kinobaza--button:hover,
        .kinobaza--button.focus {
            background: rgba(255,255,255,0.2);
            transform: translateY(-2px);
        }
        .kinobaza--button svg {
            width: 24px;
            height: 24px;
            margin-right: 1em;
        }
        .online-empty__button {
            display: inline-block;
            padding: 0.8em 1.5em;
            margin: 0.5em;
            background: rgba(255,255,255,0.15);
            border-radius: 0.4em;
            cursor: pointer;
            transition: all 0.3s;
        }
        .online-empty__button:hover,
        .online-empty__button.focus {
            background: rgba(255,255,255,0.25);
        }
        </style>
    `);
    $('body').append(Lampa.Template.get('kinobaza_css', {}, true));

    Lampa.Component.add('kinobaza', component);

    // Создаем кнопку
    var button = `
        <div class="full-start__button selector view--online kinobaza--button" data-subtitle="Кинобаза v2.0.0">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                <path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14z"/>
                <path d="M9.5 8.5H14.5V9.5H9.5z"/>
                <path d="M9.5 11.5H14.5V12.5H9.5z"/>
                <path d="M9.5 14.5H14.5V15.5H9.5z"/>
            </svg>
            <span>Кинобаза</span>
        </div>
    `;

    function addButton(e) {
      if (e.render.find('.kinobaza--button').length) return;
      var btn = $(button);
      btn.on('hover:enter', function() {
        Lampa.Component.add('kinobaza', component);
        
        Lampa.Activity.push({
          url: '',
          title: 'Кинобаза',
          component: 'kinobaza',
          movie: e.movie,
          page: 1
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

    console.log('Кинобаза: Плагин успешно инициализирован');
  }

  if (!window.kinobaza_plugin) {
    // Ждем загрузки Lampa
    if (typeof Lampa !== 'undefined') {
      startPlugin();
    } else {
      setTimeout(function() {
        if (typeof Lampa !== 'undefined') {
          startPlugin();
        }
      }, 1000);
    }
  }

})();
