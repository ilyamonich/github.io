(function() {
    'use strict';

    function kinogo(component, _object) {
        var network = new Lampa.Reguest();
        var object = _object;

        this.searchByTitle = function(_object, query) {
            var _this = this;
            object = _object;

            console.log('Kinogo search for:', query);

            // Создаем простой результат с тестовыми ссылками
            // В реальной реализации здесь должен быть парсинг Kinogo
            var mockResults = {
                player_links: {
                    movie: [
                        {
                            link: 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4',
                            translation: 'Тестовое видео 1',
                            quality: 720
                        },
                        {
                            link: 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_2MB.mp4',
                            translation: 'Тестовое видео 2',
                            quality: 1080
                        }
                    ],
                    playlist: {}
                }
            };

            // Имитируем загрузку
            setTimeout(function() {
                success(mockResults);
                component.loading(false);
            }, 1000);
        };

        this.find = function(kinogo_id, kinogo_url) {
            // Используем searchByTitle для поиска
            this.searchByTitle(object, object.movie.title);
        };

        this.extendChoice = function(saved) {
            // Пустая реализация
        };

        this.reset = function() {
            component.reset();
        };

        this.filter = function(type, a, b) {
            // Пустая реализация
        };

        this.destroy = function() {
            network.clear();
        };

        function success(json) {
            var extract = {};
            
            if (json.player_links.movie && json.player_links.movie.length > 0) {
                json.player_links.movie.forEach(function(movie, index) {
                    extract[index + 1] = {
                        file: movie.link,
                        translation: movie.translation || 'Источник ' + (index + 1),
                        quality: movie.quality || 720
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
                    voice_name: element.translation
                });
            }

            append(filtred);
        }

        function append(items) {
            component.reset();
            component.draw(items, {
                onEnter: function onEnter(item) {
                    var play = {
                        title: item.title,
                        url: getVideoUrl(item),
                        quality: { '720p': getVideoUrl(item) }
                    };
                    
                    if (play.url) {
                        Lampa.Player.play(play);
                    } else {
                        Lampa.Noty.show('Ссылка на видео не найдена');
                    }
                }
            });
        }

        function getVideoUrl(item) {
            // Возвращаем тестовые видео URL
            if (item.translation === 1) {
                return 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4';
            } else {
                return 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_2MB.mp4';
            }
        }
    }

    function component(object) {
        var network = new Lampa.Reguest();
        var scroll = new Lampa.Scroll({ mask: true, over: true });
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

        this.draw = function(items, params) {
            if (!items || items.length === 0) {
                this.empty();
                return;
            }
            
            var viewed = Lampa.Storage.cache('online_view', 5000, []);
            
            items.forEach(function(element) {
                var hash_behold = Lampa.Utils.hash(object.movie.original_title + element.voice_name);
                
                var html = Lampa.Template.get('online_prestige_full', {
                    title: element.title,
                    quality: element.quality,
                    time: Lampa.Utils.secondsToTime((object.movie.runtime || 120) * 60, true),
                    info: element.voice_name || 'Kinogo'
                });

                // Добавляем постер если есть
                var image = html.find('.online-prestige__img');
                if (image.length > 0 && object.movie.backdrop_path) {
                    var img = image.find('img')[0];
                    if (img) {
                        img.onerror = function() {
                            img.src = './img/img_broken.svg';
                        };
                        img.onload = function() {
                            image.addClass('online-prestige__img--loaded');
                            image.find('.online-prestige__loader').remove();
                        };
                        img.src = Lampa.TMDB.image('t/p/w300' + object.movie.backdrop_path);
                    }
                }

                // Отметка о просмотренном
                if (viewed.indexOf(hash_behold) !== -1) {
                    html.find('.online-prestige__img').append('<div class="online-prestige__viewed">' + Lampa.Template.get('icon_viewed', {}, true) + '</div>');
                }

                html.on('hover:enter', function() {
                    if (object.movie.id) Lampa.Favorite.add('history', object.movie, 100);
                    if (params && params.onEnter) {
                        params.onEnter(element, html);
                    }
                });
                
                scroll.append(html);
            });
            
            this.loading(false);
            
            // Включаем управление
            Lampa.Controller.add('content', {
                toggle: function() {
                    Lampa.Controller.collectionSet(scroll.render(), scroll.render());
                    if (items.length > 0) {
                        Lampa.Controller.collectionFocus(scroll.render().find('.selector').first()[0], scroll.render());
                    }
                },
                up: function() {
                    if (Lampa.Controller.can('up')) Lampa.Controller.run('up');
                    else Lampa.Controller.toggle('head');
                },
                down: function() {
                    if (Lampa.Controller.can('down')) Lampa.Controller.run('down');
                },
                left: function() {
                    if (Lampa.Controller.can('left')) Lampa.Controller.run('left');
                    else Lampa.Controller.toggle('menu');
                },
                right: function() {
                    if (Lampa.Controller.can('right')) Lampa.Controller.run('right');
                },
                back: function() {
                    Lampa.Activity.backward();
                }
            });
            
            Lampa.Controller.toggle('content');
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

            Lampa.Background.immediately(Lampa.Utils.cardImgBackgroundBlur(object.movie));
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
            version: '1.0.0',
            name: 'Онлайн - Kinogo',
            description: 'Плагин для просмотра фильмов (тестовый)',
            component: 'online_kinogo',
            onContextMenu: function(object) {
                return {
                    name: 'Смотреть на Kinogo',
                    description: 'Тестовый плагин'
                };
            },
            onContextLauch: function(object) {
                Lampa.Component.add('online_kinogo', component);
                Lampa.Activity.push({
                    url: '',
                    title: 'Kinogo',
                    component: 'online_kinogo',
                    movie: object
                });
            }
        };

        // Добавляем переводы
        Lampa.Lang.add({
            online_balanser_dont_work: {
                ru: 'Демонстрационный режим. Используются тестовые видео.',
                en: 'Demo mode. Using test videos.'
            },
            online_watch: {
                ru: 'Смотреть (тест)',
                en: 'Watch (test)'
            },
            title_online: {
                ru: 'Kinogo Тест',
                en: 'Kinogo Test'
            },
            online_nolink: {
                ru: 'Ссылка не найдена',
                en: 'Link not found'
            }
        });

        // Добавляем CSS стили
        Lampa.Template.add('online_prestige_css', `
            <style>
            .online-prestige {
                position: relative;
                border-radius: 8px;
                background: rgba(0,0,0,0.3);
                display: flex;
                margin: 10px 0;
                padding: 15px;
            }
            .online-prestige__img {
                position: relative;
                width: 120px;
                height: 80px;
                flex-shrink: 0;
                margin-right: 15px;
                border-radius: 6px;
                overflow: hidden;
                background: #333;
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
            .online-prestige__viewed {
                position: absolute;
                top: 5px;
                left: 5px;
                background: rgba(0,0,0,0.7);
                border-radius: 50%;
                padding: 3px;
            }
            .online-prestige__viewed svg {
                width: 16px;
                height: 16px;
            }
            .online-prestige.selector.focus {
                background: rgba(255,255,255,0.1);
                transform: scale(1.02);
            }
            </style>
        `);
        $('body').append(Lampa.Template.get('online_prestige_css', {}, true));

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
                <div>Это демонстрационная версия плагина</div>
            </div>
        `);

        Lampa.Template.add('icon_viewed', `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M21 7L9 19L3.5 13.5L4.91 12.09L9 16.17L19.59 5.59L21 7Z"/>
            </svg>
        `);

        // Добавляем кнопку в интерфейс
        Lampa.Listener.follow('full', function(e) {
            if (e.type == 'complite') {
                var buttonHtml = `
                    <div class="full-start__button selector view--online" data-subtitle="Kinogo Test">
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
                    Lampa.Component.add('online_kinogo', component);
                    Lampa.Activity.push({
                        url: '',
                        title: Lampa.Lang.translate('title_online'),
                        component: 'online_kinogo',
                        movie: e.data.movie
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

        Lampa.Manifest.plugins = manifest;
        Lampa.Component.add('online_kinogo', component);
    }

    // Запускаем плагин
    if (Lampa.Manifest.app_digital >= 155) {
        // Ждем загрузки Lampa
        if (window.Lampa) {
            startPlugin();
        } else {
            document.addEventListener('lampa_start', startPlugin);
        }
    }

})();
// Test
