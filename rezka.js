(function () {
    // Регистрация плагина в Lampa
    Lampa.Plugin.register('kinogo', {
        title: 'Kinogo.media',
        description: 'Источник видео с kinogo.media',
        version: '1.0.0',
        author: 'YourName',

        // Вызывается при открытии карточки фильма
        movie(data, callback) {
            const title = data.title || data.name;
            const year = data.year;

            // Формируем поисковый запрос
            const query = encodeURIComponent(`${title} ${year}`);
            const url = `https://kinogo.media/search/${query}`;

            // Делаем запрос на сайт
            Lampa.Request.get(url, (result) => {
                try {
                    // Парсим HTML (упрощённо)
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(result, 'text/html');

                    // Находим ссылку на фильм (пример селектора)
                    const linkEl = doc.querySelector('.movie-item a');
                    if (linkEl) {
                        const movieUrl = linkEl.getAttribute('href');

                        // Получаем ссылки на видео
                        Lampa.Request.get(movieUrl, (moviePage) => {
                            const movieDoc = parser.parseFromString(moviePage, 'text/html');
                            const videoLinks = [];

                            // Ищем iframe или прямые ссылки (адаптируйте под структуру kinogo.media)
                            movieDoc.querySelectorAll('iframe').forEach(iframe => {
                                const src = iframe.getAttribute('src');
                                if (src && src.includes('video')) {
                                    videoLinks.push({
                                        url: src,
                                        title: 'Kinogo (iframe)',
                                        type: 'external' // или 'm3u8', 'mp4' — зависит от источника
                                    });
                                }
                            });

                            callback(videoLinks);
                        });
                    } else {
                        callback([]); // Не найдено
                    }
                } catch (e) {
                    console.error('Kinogo plugin error:', e);
                    callback([]);
                }
            }, () => {
                callback([]); // Ошибка запроса
            });
        }
    });
})();
