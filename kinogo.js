(function() {
    'use strict';

    // Проверяем что Lampa загружена
    if (typeof Lampa === 'undefined') {
        console.error('Lampa not found');
        return;
    }

    console.log('Kinogo plugin loading...');

    // Конфигурация
    var plugin_config = {
        name: 'kinogo',
        version: '1.0.0',
        api_url: 'https://kinogo.ec/',
        proxy_url: 'https://api.allorigins.win/raw?url=',
        search_url: 'https://kinogo.ec/index.php?do=search'
    };

    // Основной класс плагина
    function KinogoPlugin(component, object) {
        this.component = component;
        this.object = object;
        this.network = new Lampa.Reguest();
        this.results = [];
    }

    KinogoPlugin.prototype.searchByTitle = function(query) {
        var self = this;
        console.log('Searching Kinogo for:', query);

        // Простой поиск - сразу переходим к тестовым данным
        setTimeout(function() {
            self.showTestData();
        }, 1000);
    };

    KinogoPlugin.prototype.showTestData = function() {
        console.log('Showing test data');
        
        // Создаем тестовые данные
        this.results = {
            player_links: {
                movie: [
                    {
                        link: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
                        translation: 'Тестовый перевод',
                        qualities: [360, 480, 720, 1080]
                    }
                ],
                playlist: {}
            },
            title: 'Тестовый фильм',
            year: '2023'
        };

        this.extractData();
        this.showResults();
    };

    KinogoPlugin.prototype.extractData = function() {
        this.extract = {};
        
        if (this.results.player_links.movie && this.results.player_links.movie.length > 0) {
            this.results.player_links.movie.forEach(function(movie, index) {
                this.extract[index + 1] = {
                    file: movie.link,
                    translation: movie.translation,
                    quality: 720,
                    qualities: movie.qualities,
                    voice: movie.translation
                };
            }.bind(this));
        }
    };

    KinogoPlugin.prototype.showResults = function() {
        var items = [];
        
        for (var movie_id in this.extract) {
            var movie = this.extract[movie_id];
            items.push({
                title: movie.translation,
                quality: movie.quality + 'p',
                qualitys: movie.qualities,
                translation: parseInt(movie_id),
                voice_name: movie.voice
            });
        }

        this.component.draw(items, {
            onEnter: function(item, html) {
                var play = {
                    title: item.title,
                    url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
                    quality: { '720p': 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' }
                };
                
                Lampa.Player.play(play);
                
                if (item.mark) item.mark();
            },
            onContextMenu: function(item, html, data, call) {
                call({
                    file: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
                    quality: { '720p': 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' }
                });
            }
        });
        
        this.component.loading(false);
    };

    KinogoPlugin.prototype.destroy = function() {
        this.network.clear();
    };

    // Компонент для Lampa
    function KinogoComponent(object) {
        this.object = object;
        this.activity = null;
        this.scroll = new Lampa.Scroll({ mask: true, over: true });
        this.files = new Lampa.Explorer(object);
        this.plugin = null;
        this.initialized = false;
    }

    KinogoComponent.prototype.initialize = function() {
        this.plugin = new KinogoPlugin(this, this.object);
        
        this.files.appendFiles(this.scroll.render());
        this.files.appendHead(this.createHeader());
        this.scroll.body().addClass('torrent-list');
        
        this.search();
    };

    KinogoComponent.prototype.createHeader = function() {
        var header = $('<div class="explorer__files-head"></div>');
        var title = $('<div class="explorer__files-title">Kinogo</div>');
        var back = $('<div class="explorer__files-back selector"><svg width="48" height="48" viewBox="0 0 48 48" fill="none"><path d="M31 36L19 24L31 12" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></div>');
        
        back.on('hover:enter', function() {
            this.back();
        }.bind(this));
        
        header.append(back);
        header.append(title);
        
        return header;
    };

    KinogoComponent.prototype.create = function() {
        return this.render();
    };

    KinogoComponent.prototype.render = function() {
        return this.files.render();
    };

    KinogoComponent.prototype.search = function() {
        this.activity.loader(true);
        
        if (this.plugin && this.plugin.searchByTitle) {
            var query = this.object.search || 
                       this.object.movie.original_title || 
                       this.object.movie.original_name || 
                       this.object.movie.title || 
                       this.object.movie.name;
            this.plugin.searchByTitle(query);
        }
    };

    KinogoComponent.prototype.draw = function(items, params) {
        if (!items || items.length === 0) {
            this.empty();
            return;
        }

        var self = this;
        var scroll_to_element = false;

        items.forEach(function(element, index) {
            Lampa.Arrays.extend(element, {
                info: element.voice_name || '',
                quality: element.quality || '720p',
                time: '01:30:00'
            });

            var html = Lampa.Template.get('online_prestige_full', element);
            var loader = html.find('.online-prestige__loader');
            var image = html.find('.online-prestige__img');

            // Убираем лоадер для тестовых данных
            loader.remove();
            image.append('<div class="online-prestige__episode-number">TEST</div>');

            element.mark = function() {
                console.log('Marked as watched:', element.title);
            };

            element.unmark = function() {
                console.log('Unmarked:', element.title);
            };

            element.timeclear = function() {
                console.log('Time cleared:', element.title);
            };

            html.on('hover:enter', function() {
                if (self.object.movie.id) {
                    Lampa.Favorite.add('history', self.object.movie, 100);
                }
                if (params.onEnter) {
                    params.onEnter(element, html);
                }
            }).on('hover:focus', function(e) {
                scroll_to_element = html;
                self.scroll.update(html, true);
            });

            self.scroll.append(html);
        });

        if (scroll_to_element) {
            self.scroll.update(scroll_to_element, true);
        }

        self.loading(false);
        Lampa.Controller.enable('content');
    };

    KinogoComponent.prototype.empty = function() {
        var html = Lampa.Template.get('online_does_not_answer', {});
        html.find('.online-empty__buttons').remove();
        html.find('.online-empty__title').text('Нет результатов');
        this.scroll.append(html);
        this.loading(false);
    };

    KinogoComponent.prototype.loading = function(status) {
        if (status) {
            this.activity.loader(true);
        } else {
            this.activity.loader(false);
            this.activity.toggle();
        }
    };

    KinogoComponent.prototype.start = function() {
        if (!this.initialized) {
            this.initialized = true;
            this.initialize();
        }

        Lampa.Controller.add('content', {
            toggle: function() {
                Lampa.Controller.collectionSet(this.scroll.render(), this.files.render());
            }.bind(this),
            up: function() {
                if (Lampa.Navigator.canmove('up')) {
                    Lampa.Navigator.move('up');
                } else {
                    Lampa.Controller.toggle('head');
                }
            },
            down: function() {
                Lampa.Navigator.move('down');
            },
            right: function() {
                if (Lampa.Navigator.canmove('right')) {
                    Lampa.Navigator.move('right');
                }
            },
            left: function() {
                if (Lampa.Navigator.canmove('left')) {
                    Lampa.Navigator.move('left');
                } else {
                    Lampa.Controller.toggle('menu');
                }
            },
            back: this.back.bind(this)
        });

        Lampa.Controller.toggle('content');
    };

    KinogoComponent.prototype.back = function() {
        Lampa.Activity.backward();
    };

    KinogoComponent.prototype.pause = function() {};
    KinogoComponent.prototype.stop = function() {};

    KinogoComponent.prototype.destroy = function() {
        if (this.plugin) {
            this.plugin.destroy();
        }
        if (this.scroll) {
            this.scroll.destroy();
        }
        if (this.files) {
            this.files.destroy();
        }
    };

    // Инициализация плагина
    function initPlugin() {
        console.log('Initializing Kinogo plugin...');
        
        // Проверяем необходимые компоненты Lampa
        if (typeof Lampa.Component === 'undefined') {
            console.error('Lampa.Component not available');
            return false;
        }

        if (typeof Lampa.Template === 'undefined') {
            console.error('Lampa.Template not available');
            return false;
        }

        // Регистрируем плагин
        var manifest = {
            id: 'kinogo_plugin',
            type: 'video',
            version: plugin_config.version,
            name: 'Онлайн - Kinogo',
            description: 'Просмотр фильмов и сериалов с Kinogo',
            component: 'online_kinogo',
            onContextMenu: function(object) {
                return {
                    name: 'Смотреть на Kinogo',
                    description: 'Поиск на kinogo.ec'
                };
            },
            onContextLauch: function(object) {
                Lampa.Component.add('online_kinogo', KinogoComponent);
                Lampa.Activity.push({
                    url: '',
                    title: 'Kinogo',
                    component: 'online_kinogo',
                    movie: object,
                    page: 1
                });
            }
        };

        // Добавляем переводы
        Lampa.Lang.add({
            'online_watch': {
                ru: 'Смотреть на Kinogo',
                en: 'Watch on Kinogo',
                ua: 'Дивитися на Kinogo'
            },
            'title_online': {
                ru: 'Kinogo',
                en: 'Kinogo', 
                ua: 'Kinogo'
            }
        });

        // Регистрируем компонент
        Lampa.Component.add('online_kinogo', KinogoComponent);

        // Добавляем кнопку в полноэкранный просмотр
        Lampa.Listener.follow('full', function(e) {
            if (e.type === 'complite') {
                var button = $('<div class="full-start__button selector view--online" data-subtitle="Kinogo">\n        <svg width="135" height="147" viewBox="0 0 135 147" fill="none" xmlns="http://www.w3.org/2000/svg">\n            <path d="M121.5 96.8823C139.5 86.49 139.5 60.5092 121.5 50.1169L41.25 3.78454C23.25 -6.60776 0.750004 6.38265 0.750001 27.1673L0.75 51.9742C4.70314 35.7475 23.6209 26.8138 39.0547 35.7701L94.8534 68.1505C110.252 77.0864 111.909 97.8693 99.8725 109.369L121.5 96.8823Z" fill="currentColor"/>\n            <path d="M63 84.9836C80.3333 94.991 80.3333 120.01 63 130.017L39.75 143.44C22.4167 153.448 0.749999 140.938 0.75 120.924L0.750001 94.0769C0.750002 74.0621 22.4167 61.5528 39.75 71.5602L63 84.9836Z" fill="currentColor"/>\n        </svg>\n        <span>#{online_watch}</span>\n    </div>');

                button.on('hover:enter', function() {
                    Lampa.Component.add('online_kinogo', KinogoComponent);
                    Lampa.Activity.push({
                        url: '',
                        title: Lampa.Lang.translate('title_online'),
                        component: 'online_kinogo',
                        movie: e.data.movie,
                        page: 1
                    });
                });

                e.object.activity.render().find('.view--torrent').after(button);
            }
        });

        // Сохраняем манифест
        Lampa.Manifest.plugin_kinogo = manifest;
        
        console.log('Kinogo plugin initialized successfully');
        return true;
    }

    // Запускаем инициализацию когда Lampa готова
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(initPlugin, 1000);
        });
    } else {
        setTimeout(initPlugin, 1000);
    }

})();
// V2.1
