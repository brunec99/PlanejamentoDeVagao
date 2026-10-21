#!/bin/zsh
# Comanda o MS Project instalado na VM "Windows" do UTM sem usar a tela (ver
# docs/engenharia-reversa-project.md, seção "Conferência no Project real").
#
# O agente convidado do UTM (qemu-ga, nas SPICE Guest Tools) executa comandos como SYSTEM, mas o
# Project não abre fora da sessão do usuário; por isso o modo `usuario` cria uma tarefa agendada
# interativa para o usuário logado e espera o script terminar.
#
# uso:
#   vm.sh sistema <script.ps1> [segundos]   executa como SYSTEM e imprime a saída
#   vm.sh usuario <script.ps1> [segundos]   executa na sessão do usuário logado (necessário p/ COM do Project)
#   vm.sh enviar  <arquivo local> [nome]    copia para C:\Users\Public\msp\[nome]
#   vm.sh baixar  <nome>                    imprime C:\Users\Public\msp\<nome> no stdout
#
# Armadilhas do utmctl 4.x: `exec` não espera o comando terminar nem devolve a saída (daí o
# arquivo .done); `file pull` sai com 0 mesmo quando falha; quase toda chamada imprime "OSStatus
# error -2700" mesmo dando certo; e `file push` não cria pastas.
set -u
U=/Applications/UTM.app/Contents/MacOS/utmctl
VM=${MSP_VM:-Windows}
D='C:\Users\Public\msp'
here=${0:A:h}

enviar() { $U file push $VM "$D\\$2" < $1 2>/dev/null }
baixar() { $U file pull $VM "$D\\$1" 2>/dev/null }

sistema() {
  local f=$1 n=${1:t} t=${2:-120}
  $U exec $VM --cmd cmd.exe /c "mkdir $D 2>nul & del /q $D\\$n.out $D\\$n.done 2>nul" 2>/dev/null
  /bin/sleep 1
  enviar $here/wrap.ps1 wrap.ps1
  enviar $f $n
  $U exec $VM --cmd cmd.exe /c "powershell -NoProfile -ExecutionPolicy Bypass -File $D\\wrap.ps1 $n" 2>/dev/null
  /bin/sleep 2
  for i in $(seq 1 $t); do
    baixar $n.done | iconv -f UTF-16LE -t UTF-8 2>/dev/null | grep -q ok && break
    /bin/sleep 1
  done
  baixar $n.out
}

usuario() {
  local f=$1 t=${2:-120} tmp=$(mktemp -d)
  local tag=$tmp/asuser-$(date +%H%M%S).ps1
  enviar $f ${f:t}
  print -n ${f:t} | $U file push $VM "$D\\target.txt" 2>/dev/null
  print -n $t | $U file push $VM "$D\\timeout.txt" 2>/dev/null
  cp $here/asuser.ps1 $tag
  sistema $tag $((t + 30))
  rm -rf $tmp
}

case ${1:-} in
  sistema) sistema $2 ${3:-120} ;;
  usuario) usuario $2 ${3:-120} ;;
  enviar) enviar $2 ${3:-${2:t}} ;;
  baixar) baixar $2 ;;
  *) sed -n 9,13p $0; exit 1 ;;
esac
