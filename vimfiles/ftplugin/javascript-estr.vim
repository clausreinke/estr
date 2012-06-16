"
" first draft of vim binding for estr
"
" https://github.com/clausreinke/estr
"
" you'll need to enable filetype plugins, and, 
" in your .vimrc, let g:estr = <path to estr.js>
"

if !executable("node")
  echoerr "cannot find node"
  finish
endif

let s:estr = exists("g:estr") ? g:estr : "../../estr.js"
if !filereadable(estr)
  echoerr "cannot find estr.js; please let g:estr = <path to estr.js>"
  finish
endif

" for variable under cursor, populate location list
" with binding occurrence and other occurences
" 
" - navigate to binding occurrence: :lr
" - navigate to next occurrence: :lne
" - navigate to previous occurrence: :lp
command! FindVar call FindVar()
function! FindVar()
  let file    = expand("%")
  let oldName = expand("<cword>")
  let line    = line(".")
  let col     = col(".")
  let command = "findVar ".file." ".oldName." ".line." ".col
  echo command
  let output  = system("node ".s:estr." ".command)
  let occurrences = substitute(output,".*binding occurrence","binding occurrence","")
  let s:efm = &efm
  set efm=%-Ibinding\ occurrence:\ ,%-Iother\ occurrences:\ ,%f\ %.%#\ {\ line:\ %l\\,\ column:\ %c\ %.%#
  lexpr occurrences
  let &efm = s:efm
endfunction

" rename variable under cursor, prompting for new name
" updates file inplace, saves original in file.bak;
" diff renamed version against original
command! Rename call Rename(1)
function! Rename(diff)
  let file    = expand("%")
  let oldName = expand("<cword>")
  let line    = line(".")
  let col     = col(".")
  let newName = input("new name? ")
  let command = "rename -i.bak ".file." ".oldName." ".line." ".col." ".newName
  echo command
  let s:autoread = &autoread
  setlocal autoread
  let output  = system("node ".s:estr." ".command)
  if v:shell_error
    for l in split(output,'\n')
      echoerr l
    endfor
  else
    if a:diff
      vert diffsplit %.bak
    endif
    for l in split(output,'\n')
      echomsg l
    endfor
  endif
  let &autoread = s:autoread
endfunction
