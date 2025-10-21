(function() {
    'use strict';

    function kinogo(component, _object) {
        var network = new Lampa.Reguest();
        var object = _object;

        this.searchByTitle = function(_object, query) {
            var _this = this;
            object = _object;

            console.log('Kinogo search for:', query);

            // Создаем mock результаты с тестовыми видео
            var mockResults = {
                player_links: {
                    movie: [
                        {
                            link: 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4',
                            translation: 'Тестовое видео 1 (720p)',
                            quality: 720
                        },
                        {
                            link: 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/1080/Big_Buck_Bunny_1080_10s_5MB.mp4', 
                            translation: 'Тестовое видео 2 (1080p)',
                            quality: 1080
                        }
                    ],
                    playlist: {}
                }
            };

            // Имитируем загрузку
            setTimeout(function() {
                _this.success(mockResults);
                component.loading(false);
            }, 500);
        };

        this.success = function(json) {
            var extract = {};
            
            if (json.player_links.movie && json.player_links.movie.length > 0) {
                json.player_links.movie.forEach(function(movie, index) {
                    extract[index + 1] = {
                        file: movie.link,
                        translation: movie.translation,
                        quality: movie.quality
                    };
                });
            }

            var filtred = [];
            for (var transl_id in extract) {
                var element = extract[transl_id];
                filtred.push({
                    title: element.translation,
                    quality: (element.quality || 720) + 'p',
                    translation: parseInt(transl_id),
                    voice_name: element.translation,
                    file: element.file
                });
            }

            component.draw(filtred, {
                onEnter: function(item) {
                    console.log('Playing:', item.file);
                    var play = {
                        title: item.title,
                        url: item.file,
                        quality: { '720p': item.file }
                    };
                    
                    Lampa.Player.play(play);
                }
            });
        };

        this.find = function() {
            this.searchByTitle(object, object.movie.title);
        };

        this.extendChoice = function() {};
        this.reset = function() {};
        this.filter = function() {};
        this.destroy = function() {
            network.clear();
        };
    }

    function component(object) {
        var self = this;
        var network = new Lampa.Reguest();
        var scroll = new Lampa.Scroll({ mask: true, over: true });
        var source = new kinogo(this, object);
        var initialized = false;

        this.create = function() {
            return this.render();
        };

        this.render = function() {
            return scroll.render();
        };

        this.initialize = function() {
            this.search();
        };

        this.search = function() {
            this.activity.loader(true);
            source.searchByTitle(object, object.search || object.movie.original_title || object.movie.title);
        };

        this.reset = function() {
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

        this.draw = function(items, params) {
            if (!items || items.length === 0) {
                this.empty();
                return;
            }
            
            console.log('Drawing items:', items);
            
            this.reset();
            
            items.forEach(function(element, index) {
                var html = Lampa.Template.get('online_prestige_full', {
                    title: element.title,
                    quality: element.quality,
                    time: Lampa.Utils.secondsToTime((object.movie.runtime || 120) * 60, true),
                    info: 'Kinogo Demo'
                });

                // Добавляем постер
                var image = html.find('.online-prestige__img');
                if (image.length > 0) {
                    var img = image.find('img')[0];
                    if (img && object.movie.backdrop_path) {
                        img.onload = function() {
                            image.addClass('online-prestige__img--loaded');
                            image.find('.online-prestige__loader').remove();
                        };
                        img.onerror = function() {
                            image.find('.online-prestige__loader').remove();
                        };
                        img.src = Lampa.TMDB.image('t/p/w300' + object.movie.backdrop_path);
                    } else {
                        image.find('.online-prestige__loader').remove();
                    }
                }

                html.on('hover:enter', function() {
                    if (params && params.onEnter) {
                        params.onEnter(element, html);
                    }
                });

                scroll.append(html);
            });

            this.loading(false);
            this.start();
        };

        this.empty = function() {
            var html = Lampa.Template.get('online_does_not_answer', {});
            scroll.append(html);
            this.loading(false);
            this.start();
        };

        this.doesNotAnswer = function() {
            this.empty();
        };

        this.start = function() {
            if (!initialized) {
                initialized = true;
                
                Lampa.Background.immediately(Lampa.Utils.cardImgBackgroundBlur(object.movie));
                
                Lampa.Controller.add('content', {
                    toggle: function() {
                        Lampa.Controller.collectionSet(scroll.render(), scroll.render());
                        var firstItem = scroll.render().find('.selector').first();
                        if (firstItem.length > 0) {
                            Lampa.Controller.collectionFocus(firstItem[0], scroll.render());
                        }
                    },
                    up: function() {
                        if (Lampa.Controller.can('up')) {
                            Lampa.Controller.run('up');
                        } else {
                            Lampa.Controller.toggle('head');
                        }
                    },
                    down: function() {
                        if (Lampa.Controller.can('down')) {
                            Lampa.Controller.run('down');
                        }
                    },
                    left: function() {
                        if (Lampa.Controller.can('left')) {
                            Lampa.Controller.run('left');
                        } else {
                            Lampa.Controller.toggle('menu');
                        }
                    },
                    right: function() {
                        if (Lampa.Controller.can('right')) {
                            Lampa.Controller.run('right');
                        }
                    },
                    back: function() {
                        Lampa.Activity.backward();
                    }
                });
            }
            
            Lampa.Controller.toggle('content');
        };

        this.back = function() {
            Lampa.Activity.backward();
        };

        this.destroy = function() {
            network.clear();
            source.destroy();
        };
    }

    function startPlugin() {
        if (window.online_kinogo) return;
        window.online_kinogo = true;

        var manifest = {
            type: 'video',
            version: '1.0.1',
            name: 'Онлайн - Kinogo',
            description: 'Демо плагин для тестирования',
            component: 'online_kinogo',
            onContextMenu: function(object) {
                return {
                    name: 'Смотреть (демо)',
                    description: 'Тестовые видео'
                };
            },
            onContextLauch: function(object) {
                Lampa.Activity.push({
                    url: '',
                    title: 'Kinogo Demo',
                    component: 'online_kinogo',
                    movie: object
                });
            }
        };

        // Добавляем переводы
        if (!Lampa.Lang.translate('online_watch')) {
            Lampa.Lang.add({
                online_watch: {
                    ru: 'Смотреть (демо)',
                    en: 'Watch (demo)'
                },
                title_online: {
                    ru: 'Kinogo Demo',
                    en: 'Kinogo Demo'
                },
                online_balanser_dont_work: {
                    ru: 'Демонстрационный режим',
                    en: 'Demo mode'
                }
            });
        }

        // Добавляем CSS
        if (!$('#kinogo-css').length) {
            $('head').append(`
                <style id="kinogo-css">
                .online-prestige {
                    position: relative;
                    border-radius: 8px;
                    background: rgba(0,0,0,0.3);
                    display: flex;
                    margin: 10px 0;
                    padding: 15px;
                    min-height: 100px;
                }
                .online-prestige__img {
                    position: relative;
                    width: 120px;
                    height: 80px;
                    flex-shrink: 0;
                    margin-right: 15px;
                    border-radius: 6px;
                    overflow: hidden;
                    background: #222;
                }
                .online-prestige__img img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    opacity: 0;
                    transition: opacity 0.3s;
                }
                .online-prestige__img--loaded img {
                    opacity: 1;
                }
                .online-prestige__loader {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    width: 20px;
                    height: 20px;
                    margin: -10px 0 0 -10px;
                    background: url(./img/loader.svg) no-repeat center center;
                    background-size: contain;
                }
                .online-prestige__body {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                }
                .online-prestige__title {
                    font-size: 16px;
                    font-weight: bold;
                    margin-bottom: 5px;
                }
                .online-prestige__info {
                    font-size: 14px;
                    color: #aaa;
                    margin-bottom: 5px;
                }
                .online-prestige__quality {
                    font-size: 14px;
                    color: #4CAF50;
                }
                .online-prestige.selector.focus {
                    background: rgba(255,255,255,0.1);
                    transform: scale(1.02);
                }
                .view--online {
                    margin: 5px 0;
                }
                </style>
            `);
        }

        // Добавляем шаблоны
        Lampa.Template.add('online_prestige_full', `
            <div class="online-prestige selector">
                <div class="online-prestige__img">
                    <img alt="">
                    <div class="online-prestige__loader"></div>
                </div>
                <div class="online-prestige__body">
                    <div class="online-prestige__title">{title}</div>
                    <div class="online-prestige__info">{info}</div>
                    <div class="online-prestige__quality">{quality}</div>
                </div>
            </div>
        `);

        Lampa.Template.add('online_does_not_answer', `
            <div style="text-align: center; padding: 40px; color: #aaa;">
                <div style="font-size: 20px; margin-bottom: 20px;">#{online_balanser_dont_work}</div>
                <div>Используются тестовые видеофайлы</div>
            </div>
        `);

        // Регистрируем компонент
        Lampa.Component.add('online_kinogo', component);

        // Добавляем кнопку в интерфейс
        Lampa.Listener.follow('full', function(e) {
            if (e.type == 'complite') {
                var buttonHtml = `
                    <div class="full-start__button selector view--online" data-subtitle="Demo">
                        <div style="display: flex; align-items: center; padding: 12px; background: rgba(0,0,0,0.3); border-radius: 8px; margin: 5px 0;">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 10px;">
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
                            </svg>
                            <span>#{online_watch}</span>
                        </div>
                    </div>
                `;
                
                var btn = $(Lampa.Lang.translate(buttonHtml));
                btn.on('hover:enter', function() {
                    Lampa.Activity.push({
                        url: '',
                        title: Lampa.Lang.translate('title_online'),
                        component: 'online_kinogo',
                        movie: e.data.movie
                    });
                });
                
                // Добавляем кнопку после торрент кнопки
                var torrentBtn = e.object.activity.render().find('.view--torrent');
                if (torrentBtn.length) {
                    torrentBtn.after(btn);
                } else {
                    // Если нет торрент кнопки, добавляем в контейнер
                    e.object.activity.render().find('.full-start__buttons').append(btn);
                }
            }
        });

        Lampa.Manifest.plugins = manifest;
    }

    // Запускаем плагин
    if (Lampa.Manifest.app_digital >= 155) {
        if (window.Lampa && window.Lampa.Manifest) {
            startPlugin();
        } else {
            document.addEventListener('lampa_start', startPlugin);
        }
    }

})();
// тест 2
