@echo off
rem Arranca el entorno local de Horario y abre la vista previa en el navegador.
cd /d "%~dp0"
start "" http://localhost:4173/preview.html
python tools\serve.py 4173
