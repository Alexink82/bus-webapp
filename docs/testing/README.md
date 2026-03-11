# Тестирование

- **[MANUAL_TEST_CHECKLIST.md](MANUAL_TEST_CHECKLIST.md)** — пошаговый чек-лист ручной проверки сценариев пассажира, диспетчера и админа, а также краш-сценариев и стабильности.

Запуск автотестов API (из корня backend):

```bash
cd backend
pip install pytest httpx
pytest tests/test_api.py -v
```
