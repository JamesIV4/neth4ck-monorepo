#include "hack.h"

#include <string.h>
#include <unistd.h>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#endif

#if defined(__EMSCRIPTEN__) && defined(SELF_RECOVER)
/* Generic browser/library bridge for recovering checkpoint shards into the
 * normal save path before a host resumes the run through NetHack's restore
 * flow. Keeping this outside the NetHack tree minimizes fork churn.
 */
EMSCRIPTEN_KEEPALIVE
int
resume_checkpoint_save(const char *player_name)
{
    if (!player_name || !*player_name)
        return 0;

    (void) strncpy(plname, player_name, sizeof plname - 1);
    plname[sizeof plname - 1] = '\0';

    Sprintf(lock, "%u%s", (unsigned) getuid(), plname);
    regularize(lock);

    return recover_savefile();
}
#endif
