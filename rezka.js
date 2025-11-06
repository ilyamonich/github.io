(function(plugin) {
    plugin.info = {
        title: 'Kinogo.media Source',
        description: 'Источник фильмов и сериалов с kinogo.media',
        version: '1.1.0',
        author: 'Lampa Plugin Developer'
    };

    console.log('=== KINOGO PLUGIN LOADING ===');

    plugin.init = function() {
        console.log('Kinogo plugin: init started');
        
        // Способ 1: Прямая инициализация
        setTimeout(() => {
            console.log('Kinogo plugin: attempting setup');
            setupKinogoSource();
        }, 2000);

        // Способ 2: Проверка через интервал
        let checkCount = 0;
        const checkInterval = setInterval(() => {
            checkCount++;
            console.log('Kinogo plugin: check attempt', checkCount, 'Sources available:', !!window.Sources);
            
            if (window.Sources) {
                clearInterval(checkInterval);
                console.log('Kinogo plugin: Sources found, setting up...');
                setupKinogoSource();
            }
            
            if (checkCount > 20) {
                clearInterval(checkInterval);
                console.error('Kinogo plugin: Failed to find Sources after 20 attempts');
            }
        }, 500);
    };

    function setupKinogoSource() {
        console.log('Kinogo plugin: Setting up source...');
        
        try {
            // Создаем источник с упрощенной структурой для теста
            Sources.kinogo = {
                title: 'Kinogo.media',
                menu: true,
                search: true,
                year: true,
                sort: true,
                adult: false,
                
                // Простая тестовая функция
                search: function(query) {
                    console.log('Kinogo search called with:', query);
                    return new Promise((resolve) => {
                        resolve({
                            success: true,
                            results: [
                                {
                                    title: 'Тестовый фильм: ' + query,
                                    year: '2024',
                                    description: 'Это тестовый результат',
                                    id: 'test-1',
                                    type: 'movie'
                                }
                            ]
                        });
                    });
                },

                // Простая функция для категорий
                group: function(url) {
                    return new Promise((resolve) => {
                        resolve({
                            success: true,
                            results: [
                                {
                                    title: 'Тестовый фильм из категории',
                                    year: '2024',
                                    type: 'movie',
                                    id: 'test-2'
                                }
                            ]
                        });
                    });
                }
            };
            
            console.log('✅ Kinogo source successfully added to Sources:', Sources.kinogo);
            console.log('✅ Available sources:', Object.keys(Sources));
            
            // Показываем уведомление об успехе
            if (window.Lampa && Lampa.Notification) {
                Lampa.Notification.show('Плагин Kinogo загружен!');
            }
            
        } catch (error) {
            console.error('❌ Kinogo plugin error:', error);
        }
    }

    plugin.destroy = function() {
        console.log('Kinogo plugin: destroy called');
        if (window.Sources && Sources.kinogo) {
            delete Sources.kinogo;
        }
    };

})(this.plugin = {});
