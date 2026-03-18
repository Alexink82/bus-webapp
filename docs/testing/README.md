# Тестирование

- **[MANUAL_TEST_CHECKLIST.md](MANUAL_TEST_CHECKLIST.md)** — пошаговый чек-лист ручной проверки сценариев пассажира, диспетчера и админа, а также краш-сценариев и стабильности.

Запуск автотестов API (из корня backend):

```bash
cd backend
pip install pytest httpx
pytest tests/test_api.py -v
```

Frontend smoke E2E (из корня проекта):

```bash
npm install
npx playwright install chromium
npm run test:e2e
```

Что покрыто сейчас:

- desktop smoke для `admin.html`;
- desktop smoke для `dispatcher.html`;
- проверка видимости и сохранения состояния боковых панелей;
- проверка того, что в диспетчерской не показываются `Бронь` и `Профиль`;
- проверка загрузки операционного аудита в админке.
