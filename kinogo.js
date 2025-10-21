(function() {
    'use strict';

    // Конфигурация плагина
    var PLUGIN_CONFIG = {
        name: 'kinogo',
        title: 'Kinogo.ec',
        version: '1.0.0',
        search_url: 'https://kinogo.ec/index.php?do=search',
        base_url: 'https://kinogo.ec'
    };

    // Основной класс балансера
    function KinogoBalancer(component, object) {
        var self = this;
        var network = new Lampa.Reguest();
        var currentObject = object;
        var results = [];
        var extract = {};
        var choice = {
            voice: 0,
            voice_name: ''
        };

        // Поиск по названию
        this.searchByTitle = function(object, query) {
            currentObject = object;
            console.log('Kinogo: Searching for', query);
            
            var searchData = new FormData();
            searchData.append('do', 'search');
            searchData.append('subaction', 'search');
            searchData.append('story', query);

            network.native(PLUGIN_CONFIG.search_url, {
                method: 'POST',
                body: searchData,
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            }, function(html) {
                if (html && html.includes('shortstory')) {
                    var filmUrl = parseSearchResults(html, query);
                    if (filmUrl) {
                        self.find(filmUrl);
                    } else {
                        component.doesNotAnswer();
                    }
                } else {
                    component.doesNotAnswer();
                }
            }, function(error, code) {
                console.error('Kinogo search error:', error);
                component.doesNotAnswer();
            });
        };

        // Парсинг результатов поиска
        function parseSearchResults(html, query) {
            try {
                var parser = new DOMParser();
                var doc = parser.parseFromString(html, 'text/html');
                var items = doc.querySelectorAll('.shortstory');
                
                var searchWords = query.toLowerCase().split(' ').filter(function(word) {
                    return word.length > 2;
                });

                for (var i = 0; i < items.length; i++) {
                    var item = items[i];
                    var titleElem = item.querySelector('.short-title h2 a, .short-title a');
                    if (titleElem) {
                        var title = titleElem.textContent.toLowerCase();
                        var href = titleElem.href;
                        
                        // Проверяем совпадение по ключевым словам
                        var matchCount = searchWords.filter(function(word) {
                            return title.includes(word);
                        }).length;

                        if (matchCount >= searchWords.length * 0.7) { // 70% совпадение
                            return href;
                        }
                    }
                }
                
                // Если не нашли точного совпадения, берем первый результат
                if (items.length > 0) {
                    var firstItem = items[0];
                    var firstLink = firstItem.querySelector('.short-title h2 a, .short-title a');
                    return firstLink ? firstLink.href : null;
                }
            } catch (e) {
                console.error('Kinogo parse error:', e);
            }
            return null;
        }

        // Загрузка страницы фильма
        this.find = function(filmUrl) {
            console.log('Kinogo: Loading film page', filmUrl);
            
            network.native(filmUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            }, function(html) {
                if (html) {
                    var videoData = parseFilmPage(html);
                    if (videoData && videoData.player_links.movie.length > 0) {
                        success(videoData);
                        component.loading(false);
                    } else {
                        component.doesNotAnswer();
                    }
                } else {
                    component.doesNotAnswer();
                }
            }, function(error, code) {
                console.error('Kinogo film page error:', error);
                component.doesNotAnswer();
            });
        };

        // Парсинг страницы фильма
        function parseFilmPage(html) {
            try {
                var result = {
                    player_links: {
                        movie: [],
                        playlist: {}
                    }
                };

                var parser = new DOMParser();
                var doc = parser.parseFromString(html, 'text/html');

                // Ищем iframe с видео
                var iframes = doc.querySelectorAll('iframe');
                iframes.forEach(function(iframe, index) {
                    if (iframe.src && iframe.src.includes('//')) {
                        result.player_links.movie.push({
                            link: iframe.src,
                            translation: 'Iframe ' + (index + 1),
                            quality: 720
                        });
                    }
                });

                // Ищем видео в плеерах
                var players = doc.querySelectorAll('.player, .video-player');
                players.forEach(function(player, playerIndex) {
                    // Ищем data-link атрибуты
                    var dataLinks = player.querySelectorAll('[data-link]');
                    dataLinks.forEach(function(link, linkIndex) {
                        var videoUrl = link.getAttribute('data-link');
                        if (videoUrl && videoUrl.includes('//')) {
                            result.player_links.movie.push({
                                link: videoUrl,
                                translation: 'Player ' + (playerIndex + 1) + '-' + (linkIndex + 1),
                                quality: 720
                            });
                        }
                    });

                    // Ищем скрытые ссылки
                    var hiddenInputs = player.querySelectorAll('input[type="hidden"]');
                    hiddenInputs.forEach(function(input) {
                        if (input.value && input.value.includes('//') && 
                            (input.value.includes('.mp4') || input.value.includes('.m3u8'))) {
                            result.player_links.movie.push({
                                link: input.value,
                                translation: 'Hidden ' + (playerIndex + 1),
                                quality: 720
                            });
                        }
                    });
                });

                // Ищем в скриптах
                var scripts = doc.querySelectorAll('script');
                scripts.forEach(function(script) {
                    var scriptText = script.textContent || script.innerText;
                    if (scriptText) {
                        // Ищем file: 'url'
                        var fileMatch = scriptText.match(/file\s*:\s*['"]([^'"]+)['"]/);
                        if (fileMatch && fileMatch[1]) {
                            result.player_links.movie.push({
                                link: fileMatch[1],
                                translation: 'Script Source',
                                quality: 720
                            });
                        }

                        // Ищем http ссылки на видео
                        var httpMatches = scriptText.match(/(https?:\/\/[^\s"']*\.(?:mp4|m3u8|mkv)[^\s"']*)/gi);
                        if (httpMatches) {
                            httpMatches.forEach(function(url, index) {
                                result.player_links.movie.push({
                                    link: url,
                                    translation: 'Script URL ' + (index + 1),
                                    quality: 720
                                });
                            });
                        }
                    }
                });

                return result;

            } catch (e) {
                console.error('Kinogo film parse error:', e);
                return null;
            }
        }

        // Обработка успешного результата
        function success(data) {
            results = data;
            extractData(data);
            filter();
            append(filtred());
        }

        // Извлечение данных
        function extractData(data) {
            extract = {};
            if (data.player_links.movie && data.player_links.movie.length > 0) {
                data.player_links.movie.forEach(function(movie, index) {
                    extract[index + 1] = {
                        file: movie.link,
                        translation: movie.translation,
                        quality: movie.quality || 720
                    };
                });
            }
        }

        // Фильтрация
        function filter() {
            var filter_items = {
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

            component.filter(filter_items, choice);
        }

        // Получение отфильтрованного списка
        function filtred() {
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
            return filtred;
        }

        // Отображение результатов
        function append(items) {
            component.reset();
            component.draw(items, {
                onEnter: function(item) {
                    var play = {
                        title: item.title,
                        url: item.file,
                        quality: { '720p': item.file }
                    };
                    
                    if (play.url) {
                        Lampa.Player.play(play);
                    } else {
                        Lampa.Noty.show('Ссылка на видео не найдена');
                    }
                },
                onContextMenu: function(item, html, data, call) {
                    call({
                        file: item.file,
                        quality: { '720p': item.file }
                    });
                }
            });
        }

        // Методы интерфейса
        this.extendChoice = function(saved) {
            Lampa.Arrays.extend(choice, saved, true);
        };

        this.reset = function() {
            component.reset();
            choice = { voice: 0, voice_name: '' };
            if (results) {
                extractData(results);
                filter();
                append(filtred());
            }
        };

        this.filter = function(type, a, b) {
            choice[a.stype] = b.index;
            if (a.stype == 'voice') choice.voice_name = a.items[b.index].title;
            component.reset();
            extractData(results);
            filter();
            append(filtred());
        };

        this.destroy = function() {
            network.clear();
        };
    }

    // Компонент интерфейса
    function KinogoComponent(object) {
        var self = this;
        var network = new Lampa.Reguest();
        var scroll = new Lampa.Scroll({ mask: true, over: true });
        var files = new Lampa.Explorer(object);
        var filter = new Lampa.Filter(object);
        var source = new KinogoBalancer(this, object);
        var initialized = false;
        var images = [];

        this.initialize = function() {
            source = new KinogoBalancer(this, object);

            filter.onSearch = function(value) {
                Lampa.Activity.replace({
                    search: value,
                    clarification: true
                });
            };

            filter.onBack = function() {
                self.start();
            };

            filter.onSelect = function(type, a, b) {
                if (type == 'filter') {
                    if (a.reset) {
                        source.reset();
                    } else {
                        source.filter(type, a, b);
                    }
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

        this.create = function() {
            return this.render();
        };

        this.render = function() {
            return files.render();
        };

        this.search = function() {
            this.activity.loader(true);
            this.find();
        };

        this.find = function() {
            if (source.searchByTitle) {
                source.searchByTitle(object, object.search || object.movie.original_title || object.movie.original_name || object.movie.title || object.movie.name);
            }
        };

        this.reset = function() {
            network.clear();
            clearImages();
            scroll.render().find('.empty').remove();
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
            var select = [];

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
                    subtitle: filter_items.voice[choice.voice],
                    items: subitems,
                    stype: 'voice'
                });
            }

            select.push({
                title: 'Сбросить',
                reset: true
            });

            filter.set('filter', select);
        };

        this.draw = function(items, params) {
            if (!items || items.length === 0) {
                this.empty();
                return;
            }
            
            this.reset();
            
            var viewed = Lampa.Storage.cache('online_view', 5000, []);
            
            items.forEach(function(element) {
                var hash_behold = Lampa.Utils.hash(object.movie.original_title + element.voice_name);
                
                var html = Lampa.Template.get('online_prestige_full', {
                    title: element.title,
                    quality: element.quality,
                    time: Lampa.Utils.secondsToTime((object.movie.runtime || 120) * 60, true),
                    info: PLUGIN_CONFIG.title
                });

                // Загрузка изображения
                var image = html.find('.online-prestige__img');
                if (image.length > 0 && object.movie.backdrop_path) {
                    var img = image.find('img')[0];
                    if (img) {
                        img.onload = function() {
                            image.addClass('online-prestige__img--loaded');
                            image.find('.online-prestige__loader').remove();
                        };
                        img.onerror = function() {
                            image.find('.online-prestige__loader').remove();
                        };
                        img.src = Lampa.TMDB.image('t/p/w300' + object.movie.backdrop_path);
                        images.push(img);
                    }
                }

                // Отметка о просмотренном
                if (viewed.indexOf(hash_behold) !== -1) {
                    html.find('.online-prestige__img').append('<div class="online-prestige__viewed">' + Lampa.Template.get('icon_viewed', {}, true) + '</div>');
                }

                element.mark = function() {
                    viewed = Lampa.Storage.cache('online_view', 5000, []);
                    if (viewed.indexOf(hash_behold) == -1) {
                        viewed.push(hash_behold);
                        Lampa.Storage.set('online_view', viewed);
                    }
                };

                html.on('hover:enter', function() {
                    if (object.movie.id) Lampa.Favorite.add('history', object.movie, 100);
                    if (params.onEnter) params.onEnter(element, html);
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
            this.reset();
            var html = Lampa.Template.get('online_does_not_answer', {
                balanser: PLUGIN_CONFIG.name
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
            
            Lampa.Controller.add('content', {
                toggle: function() {
                    Lampa.Controller.collectionSet(scroll.render(), files.render());
                    var firstItem = scroll.render().find('.selector').first();
                    if (firstItem.length > 0) {
                        Lampa.Controller.collectionFocus(firstItem[0], scroll.render());
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

        this.back = function() {
            Lampa.Activity.backward();
        };

        this.destroy = function() {
            network.clear();
            clearImages();
            if (source.destroy) source.destroy();
        };

        function clearImages() {
            images.forEach(function(img) {
                img.onerror = null;
                img.onload = null;
                img.src = '';
            });
            images = [];
        }
    }

    // Инициализация плагина
    function initPlugin() {
        if (window.kinogo_plugin) return;
        window.kinogo_plugin = true;

        var manifest = {
            type: 'video',
            version: PLUGIN_CONFIG.version,
            name: 'Онлайн - ' + PLUGIN_CONFIG.title,
            description: 'Плагин для просмотра фильмов и сериалов с ' + PLUGIN_CONFIG.title,
            component: 'online_' + PLUGIN_CONFIG.name,
            onContextMenu: function(object) {
                return {
                    name: 'Смотреть на ' + PLUGIN_CONFIG.title,
                    description: PLUGIN_CONFIG.title
                };
            },
            onContextLauch: function(object) {
                Lampa.Activity.push({
                    url: '',
                    title: PLUGIN_CONFIG.title,
                    component: 'online_' + PLUGIN_CONFIG.name,
                    search: object.title,
                    search_one: object.title,
                    search_two: object.original_title,
                    movie: object,
                    page: 1
                });
            }
        };

        // Добавляем переводы
        Lampa.Lang.add({
            ['online_balanser_dont_work_' + PLUGIN_CONFIG.name]: {
                ru: 'Не удалось найти видео на ' + PLUGIN_CONFIG.title,
                en: 'Failed to find video on ' + PLUGIN_CONFIG.title,
                ua: 'Не вдалося знайти відео на ' + PLUGIN_CONFIG.title
            },
            ['online_watch_' + PLUGIN_CONFIG.name]: {
                ru: 'Смотреть на ' + PLUGIN_CONFIG.title,
                en: 'Watch on ' + PLUGIN_CONFIG.title,
                ua: 'Дивитися на ' + PLUGIN_CONFIG.title
            },
            ['title_online_' + PLUGIN_CONFIG.name]: {
                ru: PLUGIN_CONFIG.title,
                en: PLUGIN_CONFIG.title,
                ua: PLUGIN_CONFIG.title
            }
        });

        // Регистрируем компонент
        Lampa.Component.add('online_' + PLUGIN_CONFIG.name, KinogoComponent);

        // Добавляем кнопку в интерфейс
        Lampa.Listener.follow('full', function(e) {
            if (e.type == 'complite') {
                var buttonHtml = `
                    <div class="full-start__button selector view--online" data-subtitle="${PLUGIN_CONFIG.title}">
                        <div style="display: flex; align-items: center; padding: 12px; background: rgba(0,0,0,0.3); border-radius: 8px; margin: 5px 0;">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 10px;">
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
                            </svg>
                            <span>#{online_watch_${PLUGIN_CONFIG.name}}</span>
                        </div>
                    </div>
                `;
                
                var btn = $(Lampa.Lang.translate(buttonHtml));
                btn.on('hover:enter', function() {
                    Lampa.Activity.push({
                        url: '',
                        title: Lampa.Lang.translate('title_online_' + PLUGIN_CONFIG.name),
                        component: 'online_' + PLUGIN_CONFIG.name,
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

        Lampa.Manifest.plugins = manifest;
        console.log('Kinogo plugin initialized');
    }

    // Запуск плагина
    if (Lampa.Manifest.app_digital >= 155) {
        if (window.Lampa && window.Lampa.Manifest) {
            initPlugin();
        } else {
            document.addEventListener('lampa_start', initPlugin);
        }
    }

})();
// 3.6
